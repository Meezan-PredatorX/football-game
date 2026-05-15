import Phaser from "phaser";

export class MatchScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private activePlayer!: Phaser.GameObjects.Arc;
  private cpu!: Phaser.GameObjects.Arc;
  private ball!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  private playerScore = 0;
  private cpuScore = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private halfText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private kickoffText!: Phaser.GameObjects.Text;
  private shotPowerBg!: Phaser.GameObjects.Rectangle;
  private shotPowerFill!: Phaser.GameObjects.Rectangle;
  private timerEvent?: Phaser.Time.TimerEvent;
  private kickoffTeam: "player" | "cpu" | null = null;
  private isKickoffWaiting = false;
  private matchState: "firstHalf" | "halfTime" | "secondHalf" | "ended" = "firstHalf";
  private elapsedSeconds = 0;
  private isResetting = false;

  private playerGK!: Phaser.GameObjects.Arc;
  private cpuGK!: Phaser.GameObjects.Arc;
  private playerDefender!: Phaser.GameObjects.Arc;
  private cpuDefender!: Phaser.GameObjects.Arc;
  private playerSupport!: Phaser.GameObjects.Arc;
  private cpuSupport!: Phaser.GameObjects.Arc;
  private W = 0;
  private H = 0;
  private pad = 40;

  private readonly HALF_DURATION_SECONDS = 45 * 60;
  private readonly TIME_SCALE = 60; // 1 real second = 60 in-game seconds for quicker demo timing
  private readonly HALFTIME_SECONDS = 1; // minimal transition before second half

  private readonly PLAYER_SPEED = 500;
  private readonly PLAYER_ACCEL = 4200;
  private readonly PLAYER_DECEL = 5200;
  private readonly CPU_SPEED = 200;
  private readonly KICK_FORCE = 500;
  private readonly PLAYER_SPRINT_MULTIPLIER = 1.28;
  private readonly CPU_PRESS_SPEED = 235;
  private readonly SUPPORT_SPEED = 150;
  private readonly DEFENDER_SPEED = 165;
  private readonly RETURN_SPEED_MULTIPLIER = 0.82;

  private readonly AI_ARRIVE_RADIUS = 12;
  private readonly AI_CHASE_ZONE = 180;
  private readonly AI_RETURN_ZONE = 240;

  // Goal bounds (set in create)
  private leftGoalX = 0;
  private rightGoalX = 0;
  private goalTop = 0;
  private goalBottom = 0;

  private readonly playerSupportHome = { x: 0.18, y: 0.62 };
  private readonly playerDefenderHome = { x: 0.15, y: 0.38 };
  private readonly cpuSupportHome = { x: 0.82, y: 0.38 };
  private readonly cpuDefenderHome = { x: 0.85, y: 0.62 };

  private playerSupportState: "CHASE_BALL" | "RETURN_HOME" = "RETURN_HOME";
  private playerDefenderState: "CHASE_BALL" | "RETURN_HOME" = "RETURN_HOME";
  private cpuSupportState: "CHASE_BALL" | "RETURN_HOME" = "RETURN_HOME";
  private cpuDefenderState: "CHASE_BALL" | "RETURN_HOME" = "RETURN_HOME";

  constructor() {
    super({ key: "MatchScene" });
  }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;

    const goalH = this.H * 0.2;
    this.goalTop = (this.H - goalH) / 2;
    this.goalBottom = this.goalTop + goalH;
    this.leftGoalX = this.pad;
    this.rightGoalX = this.W - this.pad;

    this.drawPitch(this.W, this.H);
    this.physics.world.setBounds(0, 0, this.W, this.H, true, true, true, true);
    this.spawnEntities();
    this.activePlayer = this.player;
    this.refreshActivePlayerVisual();
    this.setupInput();
    this.setupScore();
    this.setupTimer();
    this.setupKickoffText();
    this.setupShotPowerUI();
    this.createMatchClock();
    this.prepareKickoff("player");
  }

  private spawnEntities() {
    const { W, H } = this;

    // Ball
    this.ball = this.add.circle(W / 2, H / 2, 10, 0xffffff);
    this.physics.add.existing(this.ball);
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    ballBody.setCollideWorldBounds(true);
    ballBody.setBounce(0.7);
    ballBody.setDamping(true);
    ballBody.setDrag(0.92);
    ballBody.setMaxVelocity(700, 700);

    // Player attacker
    this.player = this.add.circle(W * 0.23, H / 2, 14, 0x3b82f6);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // Player defender
    this.playerDefender = this.add.circle(W * 0.15, H * 0.38, 14, 0x60a5fa);
    this.physics.add.existing(this.playerDefender);
    (this.playerDefender.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // Player support
    this.playerSupport = this.add.circle(W * 0.18, H * 0.62, 14, 0x93c5fd);
    this.physics.add.existing(this.playerSupport);
    (this.playerSupport.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // Player goalkeeper
    this.playerGK = this.add.circle(W * 0.08, H / 2, 14, 0x1d4ed8);
    this.physics.add.existing(this.playerGK);
    (this.playerGK.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // CPU attacker
    this.cpu = this.add.circle(W * 0.77, H / 2, 14, 0xef4444);
    this.physics.add.existing(this.cpu);
    (this.cpu.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // CPU support
    this.cpuSupport = this.add.circle(W * 0.82, H * 0.38, 14, 0xfecaca);
    this.physics.add.existing(this.cpuSupport);
    (this.cpuSupport.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // CPU defender
    this.cpuDefender = this.add.circle(W * 0.85, H * 0.62, 14, 0xfca5a5);
    this.physics.add.existing(this.cpuDefender);
    (this.cpuDefender.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // CPU goalkeeper
    this.cpuGK = this.add.circle(W * 0.92, H / 2, 14, 0xb91c1c);
    this.physics.add.existing(this.cpuGK);
    (this.cpuGK.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // Kick overlaps for all players
    const playerEntities = [this.player, this.playerDefender, this.playerSupport, this.playerGK];
    const cpuEntities = [this.cpu, this.cpuDefender, this.cpuSupport, this.cpuGK];

    playerEntities.forEach((entity) => {
      this.physics.add.overlap(entity, this.ball, (p, b) => this.kickEntity(p as Phaser.GameObjects.Arc, b as Phaser.GameObjects.Arc), undefined, this);
    });

    cpuEntities.forEach((entity) => {
      this.physics.add.overlap(entity, this.ball, (p, b) => this.kickEntity(p as Phaser.GameObjects.Arc, b as Phaser.GameObjects.Arc), undefined, this);
    });
  }

  private spaceKey!: Phaser.Input.Keyboard.Key;
  private sprintKey!: Phaser.Input.Keyboard.Key;
  private passKey!: Phaser.Input.Keyboard.Key;
  private shootKey!: Phaser.Input.Keyboard.Key;
  private shootChargeStart = 0;
  private shootArmed = false;
  private lastBallActionTime = 0;
  private readonly BALL_ACTION_COOLDOWN_MS = 220;
  private readonly MIN_SHOT_CHARGE_MS = 60;
  private readonly MAX_SHOT_CHARGE_MS = 950;
  private lastBallTouchTime = 0;
  private readonly TOUCH_COOLDOWN_MS = 140;
  private ballOwner: "player" | "cpu" | "neutral" = "neutral";
  private playerControlLockUntil = 0;
  private intendedReceiver: Phaser.GameObjects.Arc | null = null;
  private receiverAssistUntil = 0;
  private lastAutoSwitchTime = 0;
  private readonly AUTO_SWITCH_COOLDOWN_MS = 260;

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.sprintKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.passKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.shootKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
  }

  private setActivePlayer(next: Phaser.GameObjects.Arc) {
    this.activePlayer = next;
    this.refreshActivePlayerVisual();
  }

  private refreshActivePlayerVisual() {
    const outfield = [this.player, this.playerSupport, this.playerDefender];
    outfield.forEach((p) => p.setScale(1));
    this.activePlayer.setScale(1.18);
  }

  private setupScore() {
    this.scoreText = this.add.text(this.W / 2, 16, "0 - 0", {
      fontSize: "28px",
      fontFamily: "monospace",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(0.5, 0);
  }

  private setupTimer() {
    this.halfText = this.add.text(16, 16, "1st Half", {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(0, 0);

    this.timerText = this.add.text(this.W - 16, 16, "45:00", {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(1, 0);

    this.updateTimerText();
  }

  private createMatchClock() {
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      paused: true,
      callback: this.updateMatchClock,
      callbackScope: this,
    });
  }

  private pauseMatchClock() {
    if (this.timerEvent) {
      this.timerEvent.paused = true;
    }
  }

  private resumeMatchClock() {
    if (this.timerEvent) {
      this.timerEvent.paused = false;
    }
  }

  private setupKickoffText() {
    this.kickoffText = this.add.text(this.W / 2, this.H - 42, "", {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(0.5, 0);
  }

  private prepareKickoff(kickoff: "player" | "cpu") {
    this.kickoffTeam = kickoff;
    this.isResetting = true;
    this.isKickoffWaiting = true;
    this.resetPositions(kickoff);
    this.setEntitiesKinematics(0, 0);
    this.kickoffText.setText(`Kickoff: ${kickoff === "player" ? "Player" : "CPU"} — Press SPACE`);
    this.updateTimerText();
    this.pauseMatchClock();
  }

  private executeKickoff() {
    if (!this.kickoffTeam) return;

    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const targetX = this.kickoffTeam === "player"
      ? this.W - this.pad - 80
      : this.pad + 80;
    const angle = Phaser.Math.Angle.Between(this.ball.x, this.ball.y, targetX, this.H / 2);

    ballBody.setVelocity(Math.cos(angle) * this.KICK_FORCE, Math.sin(angle) * this.KICK_FORCE);
    this.kickoffText.setText("");
    this.isKickoffWaiting = false;
    this.isResetting = false;
    this.kickoffTeam = null;
    this.resumeMatchClock();
  }

  private updateMatchClock() {
    if (this.matchState === "ended" || this.matchState === "halfTime") {
      return;
    }

    this.elapsedSeconds += this.TIME_SCALE;

    if (this.elapsedSeconds >= this.HALF_DURATION_SECONDS) {
      if (this.matchState === "firstHalf") {
        this.startHalfTime();
      } else {
        this.endMatch();
      }

      return;
    }

    this.updateTimerText();
  }

  private updateTimerText() {
    const remainingSeconds = Math.max(this.HALF_DURATION_SECONDS - this.elapsedSeconds, 0);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const formattedSeconds = seconds.toString().padStart(2, "0");

    this.timerText.setText(`${minutes}:${formattedSeconds}`);
    this.halfText.setText(this.matchState === "secondHalf" ? "2nd Half" : "1st Half");
  }

  private startHalfTime() {
    this.matchState = "halfTime";
    this.isResetting = true;
    this.setEntitiesKinematics(0, 0);
    this.halfText.setText("Half Time");
    this.timerText.setText("0:00");

    this.time.delayedCall(this.HALFTIME_SECONDS * 1000, () => {
      this.startSecondHalf();
    });
  }

  private startSecondHalf() {
    this.matchState = "secondHalf";
    this.elapsedSeconds = 0;
    this.updateTimerText();
    this.prepareKickoff("player");
  }

  private endMatch() {
    this.matchState = "ended";
    this.isResetting = true;
    this.setEntitiesKinematics(0, 0);
    this.halfText.setText("Full Time");
    this.timerText.setText("0:00");
    this.add.text(this.W / 2, this.H / 2 + 60, "Full Time", {
      fontSize: "48px",
      fontFamily: "monospace",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5);
  }

  private setEntitiesKinematics(ballVelocityX: number, ballVelocityY: number) {
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const cpuBody = this.cpu.body as Phaser.Physics.Arcade.Body;
    const playerDefenderBody = this.playerDefender.body as Phaser.Physics.Arcade.Body;
    const cpuDefenderBody = this.cpuDefender.body as Phaser.Physics.Arcade.Body;
    const playerGKBody = this.playerGK.body as Phaser.Physics.Arcade.Body;
    const cpuGKBody = this.cpuGK.body as Phaser.Physics.Arcade.Body;
    const playerSupportBody = this.playerSupport.body as Phaser.Physics.Arcade.Body;
    const cpuSupportBody = this.cpuSupport.body as Phaser.Physics.Arcade.Body;

    ballBody.setVelocity(ballVelocityX, ballVelocityY);
    playerBody.setVelocity(0, 0);
    cpuBody.setVelocity(0, 0);
    playerDefenderBody.setVelocity(0, 0);
    cpuDefenderBody.setVelocity(0, 0);
    playerGKBody.setVelocity(0, 0);
    cpuGKBody.setVelocity(0, 0);
    playerSupportBody.setVelocity(0, 0);
    cpuSupportBody.setVelocity(0, 0);
  }

  private setupShotPowerUI() {
    this.shotPowerBg = this.add.rectangle(0, 0, 64, 8, 0x111111, 0.75).setVisible(false).setDepth(20);
    this.shotPowerFill = this.add.rectangle(0, 0, 60, 4, 0x22c55e, 0.95).setVisible(false).setDepth(21);
  }

  private kickEntity(entity: Phaser.GameObjects.Arc, ball: Phaser.GameObjects.Arc) {
    if (this.time.now - this.lastBallTouchTime < this.TOUCH_COOLDOWN_MS) {
      return;
    }

    const entityBody = entity.body as Phaser.Physics.Arcade.Body;
    const ballBody = ball.body as Phaser.Physics.Arcade.Body;
    this.ballOwner = entity.x < this.W / 2 ? "player" : "cpu";
    const ballSpeed = Math.sqrt(ballBody.velocity.x ** 2 + ballBody.velocity.y ** 2);
    const playerSpeed = Math.sqrt(entityBody.velocity.x ** 2 + entityBody.velocity.y ** 2);
    const toBall = new Phaser.Math.Vector2(ball.x - entity.x, ball.y - entity.y).normalize();
    const movementDir = new Phaser.Math.Vector2(entityBody.velocity.x, entityBody.velocity.y);
    const hasMovement = movementDir.lengthSq() > 0.001;
    if (hasMovement) {
      movementDir.normalize();
    }

    const alignment = hasMovement ? Phaser.Math.Clamp(movementDir.dot(toBall), -1, 1) : 0.4;
    const controlSkill = Phaser.Math.Clamp((alignment + 1) / 2, 0, 1);
    const incomingPace = Phaser.Math.Clamp(ballSpeed / 620, 0, 1);
    const pressure = this.getOpponentPressure(entity);
    const controlQuality = Phaser.Math.Clamp(controlSkill * 0.8 + (1 - incomingPace) * 0.6 - pressure * 0.35, 0, 1);

    const teamAttackDirection = entity.x < this.W / 2 ? 1 : -1;
    const advanceTarget = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(entity.x + teamAttackDirection * (70 + controlQuality * 80), this.pad + 12, this.W - this.pad - 12),
      Phaser.Math.Clamp(entity.y + (Math.random() * 2 - 1) * 24, this.pad + 12, this.H - this.pad - 12)
    );
    const clearTarget = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(entity.x + teamAttackDirection * (120 + controlQuality * 110), this.pad + 12, this.W - this.pad - 12),
      Phaser.Math.Clamp(entity.y + (Math.random() * 2 - 1) * 45, this.pad + 12, this.H - this.pad - 12)
    );

    const isGoalkeeper = entity === this.playerGK || entity === this.cpuGK;
    const isControlledPlayer = entity === this.activePlayer;
    const isPlayerTeamEntity = entity === this.player || entity === this.playerSupport || entity === this.playerDefender || entity === this.playerGK;

    if (isPlayerTeamEntity && this.time.now < this.playerControlLockUntil) {
      // Just after pass/shot, ignore player-team touches so the action can actually travel.
      return;
    }

    if (isControlledPlayer && this.time.now >= this.playerControlLockUntil) {
      // Keep ball under user control on touch instead of bouncing away.
      ballBody.setVelocity(entityBody.velocity.x * 0.82, entityBody.velocity.y * 0.82);
      this.lastBallTouchTime = this.time.now;
      return;
    }

    const isHeavyTouch = controlQuality < 0.42;
    const chosenTarget = isGoalkeeper ? clearTarget : isHeavyTouch ? clearTarget : advanceTarget;
    const angle = Phaser.Math.Angle.Between(ball.x, ball.y, chosenTarget.x, chosenTarget.y);

    let force = 0;
    if (isGoalkeeper) {
      force = 340 + controlQuality * 160;
    } else if (isControlledPlayer) {
      force = 150 + controlQuality * 110;
    } else {
      const paceCarry = playerSpeed * (0.45 + controlQuality * 0.35);
      force = 170 + controlQuality * 170 + paceCarry;
    }

    ballBody.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
    this.lastBallTouchTime = this.time.now;
  }

  private checkGoal() {
    const bx = this.ball.x;
    const by = this.ball.y;
    const inGoalHeight = by > this.goalTop && by < this.goalBottom;

    if (inGoalHeight && bx <= this.leftGoalX) {
      this.cpuScore++;
      this.onGoal("cpu");
    } else if (inGoalHeight && bx >= this.rightGoalX) {
      this.playerScore++;
      this.onGoal("player");
    }
  }

  private onGoal(scorer: "player" | "cpu") {
    if (this.isResetting) return;
    this.isResetting = true;

    this.scoreText.setText(`${this.playerScore} - ${this.cpuScore}`);
    this.cameras.main.flash(400, 255, 255, 255, false);

    (this.ball.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    (this.cpu.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    const goalText = this.add.text(this.W / 2, this.H / 2, "GOAL!", {
      fontSize: "72px",
      fontFamily: "monospace",
      color: "#ffd700",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      goalText.destroy();
      // Conceding team gets kickoff after the goal
      this.prepareKickoff(scorer === "player" ? "cpu" : "player");
    });
  }

  private resetPositions(kickoff: "player" | "cpu") {
    const { W, H } = this;
    const ballX = kickoff === "player" ? W * 0.48 : W * 0.52;

    this.ball.setPosition(ballX, H / 2);
    (this.ball.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.player.setPosition(W * 0.23, H / 2);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.playerDefender.setPosition(W * 0.15, H * 0.38);
    (this.playerDefender.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.playerSupport.setPosition(W * 0.18, H * 0.62);
    (this.playerSupport.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.playerGK.setPosition(W * 0.08, H / 2);
    (this.playerGK.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.cpu.setPosition(W * 0.77, H / 2);
    (this.cpu.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.cpuDefender.setPosition(W * 0.85, H * 0.62);
    (this.cpuDefender.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.cpuSupport.setPosition(W * 0.82, H * 0.38);
    (this.cpuSupport.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.cpuGK.setPosition(W * 0.92, H / 2);
    (this.cpuGK.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.setActivePlayer(this.player);
  }

  private updateCPU() {
    const cpuBody = this.cpu.body as Phaser.Physics.Arcade.Body;
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const predictedBallX = this.ball.x + ballBody.velocity.x * 0.16;
    const predictedBallY = this.ball.y + ballBody.velocity.y * 0.16;
    const dist = Phaser.Math.Distance.Between(
      this.cpu.x, this.cpu.y,
      this.ball.x, this.ball.y
    );

    // Target: chase ball if on CPU side, else guard goal
    const target = this.ball.x > this.W / 2
      ? {
        x: Phaser.Math.Clamp(predictedBallX, this.W * 0.52, this.W - this.pad),
        y: Phaser.Math.Clamp(predictedBallY, this.pad, this.H - this.pad),
      }
      : {
        x: this.W * 0.78,
        y: Phaser.Math.Clamp(this.ball.y, this.goalTop, this.goalBottom),
      };

    const angle = Phaser.Math.Angle.Between(
      this.cpu.x, this.cpu.y,
      target.x, target.y
    );

    // Key fix: never slow down near ball — always approach at full speed
    // Only slow down when guarding goal and ball is far away
    const isGuarding = this.ball.x <= this.W / 2;
    const speed = !isGuarding && dist < 240
      ? this.CPU_PRESS_SPEED
      : isGuarding && dist > 80
      ? this.CPU_SPEED * 0.6
      : this.CPU_SPEED;

    cpuBody.setVelocity(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    );

    this.updateCPUSupport();
    this.updateCPUDefender();
    this.updateGoalkeeper(this.cpuGK);
  }

  private updatePlayerTeam() {
    if (this.activePlayer !== this.playerSupport) this.updatePlayerSupport();
    if (this.activePlayer !== this.playerDefender) this.updatePlayerDefender();
    this.updateGoalkeeper(this.playerGK);
  }

  private updatePlayerSupport() {
    if (this.ballOwner === "player") {
      this.updatePlayerSupportWithPossession();
      return;
    }

    this.playerSupportState = this.updateZoneState(
      this.playerSupport,
      this.playerSupportHome,
      this.playerSupportState,
      this.AI_CHASE_ZONE,
      this.AI_RETURN_ZONE
    );
    this.applyZoneMovement(this.playerSupport, this.playerSupportHome, this.playerSupportState, this.SUPPORT_SPEED);
  }

  private updatePlayerDefender() {
    this.playerDefenderState = this.updateZoneState(
      this.playerDefender,
      this.playerDefenderHome,
      this.playerDefenderState,
      this.AI_CHASE_ZONE * 0.9,
      this.AI_RETURN_ZONE * 0.9
    );
    this.applyDefenderMovement(this.playerDefender, this.playerDefenderHome, this.playerDefenderState, this.DEFENDER_SPEED, "left");
  }

  private updateCPUSupport() {
    if (this.ballOwner === "cpu") {
      this.updateCPUSupportWithPossession();
      return;
    }

    this.cpuSupportState = this.updateZoneState(
      this.cpuSupport,
      this.cpuSupportHome,
      this.cpuSupportState,
      this.AI_CHASE_ZONE,
      this.AI_RETURN_ZONE
    );
    this.applyZoneMovement(this.cpuSupport, this.cpuSupportHome, this.cpuSupportState, this.SUPPORT_SPEED);
  }

  private updateCPUDefender() {
    if (this.ballOwner === "player") {
      this.updateCPUDefenderLaneMark();
      return;
    }

    this.cpuDefenderState = this.updateZoneState(
      this.cpuDefender,
      this.cpuDefenderHome,
      this.cpuDefenderState,
      this.AI_CHASE_ZONE * 0.9,
      this.AI_RETURN_ZONE * 0.9
    );
    this.applyDefenderMovement(this.cpuDefender, this.cpuDefenderHome, this.cpuDefenderState, this.DEFENDER_SPEED, "right");
  }

  private updateGoalkeeper(goalkeeper: Phaser.GameObjects.Arc) {
    const keeperBody = goalkeeper.body as Phaser.Physics.Arcade.Body;
    const isLeftGoal = goalkeeper === this.playerGK;
    const goalX = isLeftGoal ? this.leftGoalX : this.rightGoalX;
    const postTop = new Phaser.Math.Vector2(goalX, this.goalTop);
    const postBottom = new Phaser.Math.Vector2(goalX, this.goalBottom);
    const fromBallToTop = postTop.clone().subtract(new Phaser.Math.Vector2(this.ball.x, this.ball.y)).normalize();
    const fromBallToBottom = postBottom.clone().subtract(new Phaser.Math.Vector2(this.ball.x, this.ball.y)).normalize();
    const bisector = fromBallToTop.add(fromBallToBottom).normalize();

    const fallback = new Phaser.Math.Vector2(goalX, this.H / 2).subtract(new Phaser.Math.Vector2(this.ball.x, this.ball.y)).normalize();
    const moveDir = Number.isFinite(bisector.x) && Number.isFinite(bisector.y) ? bisector : fallback;
    const target = new Phaser.Math.Vector2(this.ball.x, this.ball.y).add(moveDir.scale(120));

    const boxLeft = isLeftGoal ? this.pad : this.W - this.pad - (this.W - this.pad) * 0.12;
    const boxRight = isLeftGoal ? this.pad + (this.W - this.pad) * 0.12 : this.W - this.pad;
    const targetX = Phaser.Math.Clamp(target.x, Math.min(boxLeft, boxRight), Math.max(boxLeft, boxRight));
    const targetY = Phaser.Math.Clamp(target.y, this.goalTop - 28, this.goalBottom + 28);
    this.moveToward(goalkeeper, targetX, targetY, 170);

    if (Phaser.Math.Distance.Between(goalkeeper.x, goalkeeper.y, targetX, targetY) <= this.AI_ARRIVE_RADIUS) {
      keeperBody.setVelocity(0, 0);
    }
  }

  private updateZoneState(
    entity: Phaser.GameObjects.Arc,
    homeRatio: { x: number; y: number },
    currentState: "CHASE_BALL" | "RETURN_HOME",
    chaseRadius: number,
    returnRadius: number
  ) {
    const home = this.getHomePoint(homeRatio);
    const ballDist = Phaser.Math.Distance.Between(entity.x, entity.y, this.ball.x, this.ball.y);
    const homeDist = Phaser.Math.Distance.Between(entity.x, entity.y, home.x, home.y);
    const ballNearHome = Phaser.Math.Distance.Between(home.x, home.y, this.ball.x, this.ball.y) <= chaseRadius * 1.2;

    if (currentState === "RETURN_HOME" && ballDist <= chaseRadius && ballNearHome) {
      return "CHASE_BALL";
    }

    if (currentState === "CHASE_BALL" && (ballDist >= returnRadius || !ballNearHome || homeDist > returnRadius * 1.2)) {
      return "RETURN_HOME";
    }

    return currentState;
  }

  private applyZoneMovement(
    entity: Phaser.GameObjects.Arc,
    homeRatio: { x: number; y: number },
    state: "CHASE_BALL" | "RETURN_HOME",
    speed: number
  ) {
    if (state === "CHASE_BALL") {
      this.moveToward(entity, this.ball.x, this.ball.y, speed);
      return;
    }

    const home = this.getHomePoint(homeRatio);
    this.moveToward(entity, home.x, home.y, speed * this.RETURN_SPEED_MULTIPLIER);
    if (Phaser.Math.Distance.Between(entity.x, entity.y, home.x, home.y) <= this.AI_ARRIVE_RADIUS) {
      (entity.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }
  }

  private applyDefenderMovement(
    entity: Phaser.GameObjects.Arc,
    homeRatio: { x: number; y: number },
    state: "CHASE_BALL" | "RETURN_HOME",
    speed: number,
    side: "left" | "right"
  ) {
    const home = this.getHomePoint(homeRatio);
    const guardX = side === "left" ? this.W * 0.28 : this.W * 0.72;
    const holdX = side === "left"
      ? Math.min(this.ball.x, guardX)
      : Math.max(this.ball.x, guardX);
    const chaseTargetX = Phaser.Math.Clamp(holdX, this.W * 0.12, this.W * 0.88);
    const chaseTargetY = Phaser.Math.Clamp(this.ball.y, this.goalTop - 45, this.goalBottom + 45);

    if (state === "CHASE_BALL") {
      this.moveToward(entity, chaseTargetX, chaseTargetY, speed);
      return;
    }

    this.moveToward(entity, home.x, home.y, speed * this.RETURN_SPEED_MULTIPLIER);
    if (Phaser.Math.Distance.Between(entity.x, entity.y, home.x, home.y) <= this.AI_ARRIVE_RADIUS) {
      (entity.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }
  }

  private getHomePoint(homeRatio: { x: number; y: number }) {
    return {
      x: this.W * homeRatio.x,
      y: this.H * homeRatio.y,
    };
  }

  private moveToward(entity: Phaser.GameObjects.Arc, targetX: number, targetY: number, speed: number) {
    const body = entity.body as Phaser.Physics.Arcade.Body;
    const isGoalkeeper = entity === this.playerGK || entity === this.cpuGK;
    const safeTargetX = isGoalkeeper ? targetX : Phaser.Math.Clamp(targetX, this.pad + 10, this.W - this.pad - 10);
    const safeTargetY = isGoalkeeper ? targetY : Phaser.Math.Clamp(targetY, this.pad + 10, this.H - this.pad - 10);
    const angle = Phaser.Math.Angle.Between(entity.x, entity.y, safeTargetX, safeTargetY);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  private updateBallOwnerState() {
    const playerDist = Phaser.Math.Distance.Between(this.activePlayer.x, this.activePlayer.y, this.ball.x, this.ball.y);
    const cpuDist = Phaser.Math.Distance.Between(this.cpu.x, this.cpu.y, this.ball.x, this.ball.y);
    const controlRadius = 26;

    if (playerDist <= controlRadius && playerDist + 4 < cpuDist) {
      this.ballOwner = "player";
      return;
    }

    if (cpuDist <= controlRadius && cpuDist + 4 < playerDist) {
      this.ballOwner = "cpu";
      return;
    }

    if (playerDist > 42 && cpuDist > 42) {
      this.ballOwner = "neutral";
    }
  }

  private autoSwitchToNearestTeammate() {
    if (this.ballOwner !== "neutral") {
      return;
    }

    if (this.time.now - this.lastAutoSwitchTime < this.AUTO_SWITCH_COOLDOWN_MS) {
      return;
    }

    const outfield = [this.player, this.playerSupport, this.playerDefender];
    let nearest = outfield[0];
    let nearestDist = Phaser.Math.Distance.Between(outfield[0].x, outfield[0].y, this.ball.x, this.ball.y);

    outfield.forEach((p) => {
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y);
      if (d < nearestDist) {
        nearest = p;
        nearestDist = d;
      }
    });

    if (nearest !== this.activePlayer) {
      this.setActivePlayer(nearest);
      this.lastAutoSwitchTime = this.time.now;
    }
  }

  private getOpponentPressure(entity: Phaser.GameObjects.Arc) {
    const opponents = entity.x < this.W / 2
      ? [this.cpu, this.cpuSupport, this.cpuDefender]
      : [this.player, this.playerSupport, this.playerDefender];
    let minDist = Number.POSITIVE_INFINITY;
    opponents.forEach((opponent) => {
      const dist = Phaser.Math.Distance.Between(entity.x, entity.y, opponent.x, opponent.y);
      if (dist < minDist) minDist = dist;
    });

    const pressure = Phaser.Math.Clamp(1 - minDist / 140, 0, 1);
    return pressure;
  }

  private isBallOutsidePitch() {
    return this.ball.x < this.pad || this.ball.x > this.W - this.pad || this.ball.y < this.pad || this.ball.y > this.H - this.pad;
  }

  private updatePlayerSupportWithPossession() {
    const laneOffsetY = this.activePlayer.y < this.H / 2 ? 84 : -84;
    const targetX = Phaser.Math.Clamp(this.activePlayer.x + 90, this.W * 0.28, this.W * 0.68);
    const targetY = Phaser.Math.Clamp(this.activePlayer.y + laneOffsetY, this.pad + 24, this.H - this.pad - 24);
    this.moveToward(this.playerSupport, targetX, targetY, this.SUPPORT_SPEED * 1.02);
  }

  private updateCPUSupportWithPossession() {
    const laneOffsetY = this.cpu.y < this.H / 2 ? 84 : -84;
    const targetX = Phaser.Math.Clamp(this.cpu.x - 90, this.W * 0.32, this.W * 0.72);
    const targetY = Phaser.Math.Clamp(this.cpu.y + laneOffsetY, this.pad + 24, this.H - this.pad - 24);
    this.moveToward(this.cpuSupport, targetX, targetY, this.SUPPORT_SPEED * 1.02);
  }

  private updateCPUDefenderLaneMark() {
    const midX = (this.activePlayer.x + this.ball.x) / 2;
    const midY = (this.activePlayer.y + this.ball.y) / 2;
    const targetX = Phaser.Math.Clamp(midX + 36, this.W * 0.56, this.W * 0.84);
    const targetY = Phaser.Math.Clamp(midY, this.pad + 20, this.H - this.pad - 20);
    this.moveToward(this.cpuDefender, targetX, targetY, this.DEFENDER_SPEED * 1.05);
  }

  private canPlayerPlayBall() {
    const dist = Phaser.Math.Distance.Between(this.activePlayer.x, this.activePlayer.y, this.ball.x, this.ball.y);
    return dist <= 34;
  }

  private canTriggerBallAction() {
    return this.time.now - this.lastBallActionTime >= this.BALL_ACTION_COOLDOWN_MS && this.canPlayerPlayBall();
  }

  private markBallActionUsed() {
    this.lastBallActionTime = this.time.now;
    this.playerControlLockUntil = this.time.now + 180;
  }

  private activateReceiverAssist(receiver: Phaser.GameObjects.Arc, targetX: number, targetY: number) {
    this.intendedReceiver = receiver;
    this.receiverAssistUntil = this.time.now + 700;
    this.moveToward(receiver, targetX, targetY, this.SUPPORT_SPEED * 1.35);
  }

  private getPlayerTeammates() {
    const outfield = [this.player, this.playerSupport, this.playerDefender];
    return outfield.filter((p) => p !== this.activePlayer);
  }

  private passToTarget(targetX: number, targetY: number, power: number, laneNoise = 0) {
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const angle = Phaser.Math.Angle.Between(this.ball.x, this.ball.y, targetX, targetY);
    ballBody.setVelocity(Math.cos(angle + laneNoise) * power, Math.sin(angle + laneNoise) * power);
  }

  private applyPlayerBallControl(playerBody: Phaser.Physics.Arcade.Body) {
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const distToBall = Phaser.Math.Distance.Between(this.activePlayer.x, this.activePlayer.y, this.ball.x, this.ball.y);
    if (distToBall > 34) {
      return;
    }

    const playerSpeed = Math.sqrt(playerBody.velocity.x ** 2 + playerBody.velocity.y ** 2);
    if (playerSpeed < 28) {
      return;
    }

    const toBall = new Phaser.Math.Vector2(this.ball.x - this.activePlayer.x, this.ball.y - this.activePlayer.y).normalize();
    const playerDir = new Phaser.Math.Vector2(playerBody.velocity.x, playerBody.velocity.y).normalize();
    const controlAlignment = Phaser.Math.Clamp(playerDir.dot(toBall), -1, 1);
    const controlGain = Phaser.Math.Clamp((controlAlignment + 1) / 2, 0, 1);
    const carryStrength = 0.12 + controlGain * 0.14;

    ballBody.setVelocity(
      ballBody.velocity.x * (1 - carryStrength) + playerBody.velocity.x * carryStrength,
      ballBody.velocity.y * (1 - carryStrength) + playerBody.velocity.y * carryStrength
    );
  }

  private applyPlayerDribblePocket(playerBody: Phaser.Physics.Arcade.Body) {
    if (this.time.now < this.playerControlLockUntil) {
      return;
    }

    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const playerSpeed = Math.sqrt(playerBody.velocity.x ** 2 + playerBody.velocity.y ** 2);
    if (playerSpeed < 18) {
      return;
    }

    const moveDir = new Phaser.Math.Vector2(playerBody.velocity.x, playerBody.velocity.y).normalize();
    const pocketX = this.activePlayer.x + moveDir.x * 16;
    const pocketY = this.activePlayer.y + moveDir.y * 16;
    const distToPocket = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, pocketX, pocketY);

    if (distToPocket > 42) {
      return;
    }

    const pull = Phaser.Math.Clamp(0.14 + playerSpeed / 1500, 0.14, 0.27);
    this.ball.x += (pocketX - this.ball.x) * pull;
    this.ball.y += (pocketY - this.ball.y) * pull;
    ballBody.setVelocity(
      ballBody.velocity.x * 0.7 + playerBody.velocity.x * 0.3,
      ballBody.velocity.y * 0.7 + playerBody.velocity.y * 0.3
    );
  }

  private tuneBallPhysicsBySpeed() {
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const speed = Math.sqrt(ballBody.velocity.x ** 2 + ballBody.velocity.y ** 2);

    if (speed > 520) {
      ballBody.setBounce(0.52);
      ballBody.setDrag(0.89);
      return;
    }

    if (speed > 260) {
      ballBody.setBounce(0.45);
      ballBody.setDrag(0.91);
      return;
    }

    ballBody.setBounce(0.34);
    ballBody.setDrag(0.935);
  }

  private passBall() {
    const teammates = this.getPlayerTeammates();
    let best = teammates[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    teammates.forEach((mate) => {
      const toMate = Phaser.Math.Distance.Between(this.activePlayer.x, this.activePlayer.y, mate.x, mate.y);
      const forwardProgress = mate.x - this.activePlayer.x;
      const spacing = Phaser.Math.Distance.Between(mate.x, mate.y, this.cpu.x, this.cpu.y);
      const score = forwardProgress * 1.4 + spacing * 0.5 - toMate * 0.35;
      if (score > bestScore) {
        best = mate;
        bestScore = score;
      }
    });

    const leadX = best.x + (best.x - this.activePlayer.x) * 0.12;
    const leadY = best.y + (best.y - this.activePlayer.y) * 0.12;
    this.passToTarget(leadX, leadY, 500, Phaser.Math.FloatBetween(-0.02, 0.02));
    this.activateReceiverAssist(best, leadX, leadY);
    this.setActivePlayer(best);
    this.markBallActionUsed();
  }

  private applyReceiverAssist() {
    if (!this.intendedReceiver) {
      return;
    }

    if (this.time.now > this.receiverAssistUntil) {
      this.intendedReceiver = null;
      return;
    }

    const receiver = this.intendedReceiver;
    const distToBall = Phaser.Math.Distance.Between(receiver.x, receiver.y, this.ball.x, this.ball.y);
    if (distToBall < 20) {
      this.intendedReceiver = null;
      return;
    }

    this.moveToward(receiver, this.ball.x, this.ball.y, this.SUPPORT_SPEED * 1.22);
  }

  private shootBall(chargeMs: number) {
    const clampedCharge = Phaser.Math.Clamp(chargeMs, this.MIN_SHOT_CHARGE_MS, this.MAX_SHOT_CHARGE_MS);
    const chargeRatio = (clampedCharge - this.MIN_SHOT_CHARGE_MS) / (this.MAX_SHOT_CHARGE_MS - this.MIN_SHOT_CHARGE_MS);
    const power = Phaser.Math.Linear(340, 760, chargeRatio);

    const playerBody = this.activePlayer.body as Phaser.Physics.Arcade.Body;
    const inputX = (this.cursors.right.isDown || this.wasd.right.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.left.isDown ? 1 : 0);
    const inputY = (this.cursors.down.isDown || this.wasd.down.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.up.isDown ? 1 : 0);
    const hasInputAim = inputX !== 0 || inputY !== 0;

    let targetX = this.W - this.pad;
    let targetY = this.H / 2;

    if (hasInputAim) {
      targetX = this.ball.x + inputX * 260;
      targetY = this.ball.y + inputY * 260;
    } else if (Math.abs(playerBody.velocity.x) + Math.abs(playerBody.velocity.y) > 20) {
      targetX = this.ball.x + playerBody.velocity.x * 0.9;
      targetY = this.ball.y + playerBody.velocity.y * 0.9;
    }

    targetX = Phaser.Math.Clamp(targetX, this.pad, this.W - this.pad);
    targetY = Phaser.Math.Clamp(targetY, this.pad, this.H - this.pad);
    this.passToTarget(targetX, targetY, power, 0);
    this.markBallActionUsed();
  }

  private updateShotPowerUI() {
    if (!this.shootKey.isDown || this.shootChargeStart <= 0) {
      this.shotPowerBg.setVisible(false);
      this.shotPowerFill.setVisible(false);
      return;
    }

    const chargeMs = this.time.now - this.shootChargeStart;
    const clampedCharge = Phaser.Math.Clamp(chargeMs, this.MIN_SHOT_CHARGE_MS, this.MAX_SHOT_CHARGE_MS);
    const ratio = (clampedCharge - this.MIN_SHOT_CHARGE_MS) / (this.MAX_SHOT_CHARGE_MS - this.MIN_SHOT_CHARGE_MS);
    const width = 60 * ratio;
    const color = ratio > 0.75 ? 0xef4444 : ratio > 0.45 ? 0xf59e0b : 0x22c55e;
    const x = this.activePlayer.x;
    const y = this.activePlayer.y - 28;

    this.shotPowerBg.setPosition(x, y).setVisible(true);
    this.shotPowerFill
      .setPosition(x - 30 + width / 2, y)
      .setSize(Math.max(width, 2), 4)
      .setFillStyle(color, 0.95)
      .setVisible(true);
  }

  update() {
    if (this.isResetting) {
      if (this.isKickoffWaiting && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.executeKickoff();
      }
      return;
    }

    // Player movement
    const playerBody = this.activePlayer.body as Phaser.Physics.Arcade.Body;

    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;

    const movementSpeed = this.sprintKey.isDown ? this.PLAYER_SPEED * this.PLAYER_SPRINT_MULTIPLIER : this.PLAYER_SPEED;
    const inputX = (right ? 1 : 0) - (left ? 1 : 0);
    const inputY = (down ? 1 : 0) - (up ? 1 : 0);
    const hasInput = inputX !== 0 || inputY !== 0;

    if (hasInput) {
      const targetVelocity = new Phaser.Math.Vector2(inputX, inputY).normalize().scale(movementSpeed);
      const step = (this.PLAYER_ACCEL * this.game.loop.delta) / 1000;
      const deltaVelocity = targetVelocity.subtract(new Phaser.Math.Vector2(playerBody.velocity.x, playerBody.velocity.y));

      if (deltaVelocity.length() <= step || deltaVelocity.length() <= movementSpeed * 0.24) {
        playerBody.setVelocity(targetVelocity.x, targetVelocity.y);
      } else {
        deltaVelocity.normalize().scale(step);
        playerBody.setVelocity(playerBody.velocity.x + deltaVelocity.x, playerBody.velocity.y + deltaVelocity.y);
      }
    } else {
      const currentSpeed = Math.sqrt(playerBody.velocity.x ** 2 + playerBody.velocity.y ** 2);
      if (currentSpeed > 0) {
        const decelStep = (this.PLAYER_DECEL * this.game.loop.delta) / 1000;
        const nextSpeed = Math.max(0, currentSpeed - decelStep);
        if (nextSpeed === 0) {
          playerBody.setVelocity(0, 0);
        } else {
          playerBody.velocity.normalize().scale(nextSpeed);
        }
      }
    }

    this.updateBallOwnerState();
    this.autoSwitchToNearestTeammate();
    this.applyPlayerBallControl(playerBody);
    this.applyPlayerDribblePocket(playerBody);
    this.tuneBallPhysicsBySpeed();

    if (Phaser.Input.Keyboard.JustDown(this.passKey) && this.canTriggerBallAction()) {
      this.passBall();
    }

    if (Phaser.Input.Keyboard.JustDown(this.shootKey) && this.canTriggerBallAction()) {
      this.shootChargeStart = this.time.now;
      this.shootArmed = true;
    }

    if (Phaser.Input.Keyboard.JustUp(this.shootKey) && this.shootChargeStart > 0 && this.shootArmed) {
      this.shootBall(this.time.now - this.shootChargeStart);
      this.shootChargeStart = 0;
      this.shootArmed = false;
    } else if (Phaser.Input.Keyboard.JustUp(this.shootKey)) {
      this.shootChargeStart = 0;
      this.shootArmed = false;
    }

    this.updateShotPowerUI();
    this.updatePlayerTeam();
    this.applyReceiverAssist();
    this.updateCPU();
    this.checkGoal();
    this.updateLooseBallRecovery();
  }

  private updateLooseBallRecovery() {
    if (!this.isBallOutsidePitch()) {
      return;
    }

    const recoverX = Phaser.Math.Clamp(this.ball.x, this.pad + 14, this.W - this.pad - 14);
    const recoverY = Phaser.Math.Clamp(this.ball.y, this.pad + 14, this.H - this.pad - 14);
    this.moveToward(this.playerSupport, recoverX, recoverY, this.SUPPORT_SPEED * 1.08);
    this.moveToward(this.cpu, recoverX, recoverY, this.CPU_PRESS_SPEED);
  }

  private drawPitch(W: number, H: number) {
    const g = this.add.graphics();
    const pad = this.pad;
    const pW = W - pad * 2;
    const pH = H - pad * 2;

    // Grass stripes
    for (let i = 0; i < 8; i++) {
      g.fillStyle(i % 2 === 0 ? 0x2d7a2d : 0x287228, 1);
      g.fillRect(pad + (i * pW) / 8, pad, pW / 8, pH);
    }

    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(pad, pad, pW, pH);
    g.lineBetween(W / 2, pad, W / 2, H - pad);
    g.strokeCircle(W / 2, H / 2, pH * 0.15);
    g.fillStyle(0xffffff);
    g.fillCircle(W / 2, H / 2, 4);

    const boxH = pH * 0.5;
    const boxW = pW * 0.14;
    const smallBoxH = pH * 0.28;
    const smallBoxW = pW * 0.06;
    const goalH = pH * 0.2;
    const goalW = 18;

    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(pad, (H - boxH) / 2, boxW, boxH);
    g.strokeRect(pad, (H - smallBoxH) / 2, smallBoxW, smallBoxH);
    g.lineStyle(3, 0xffd700, 1);
    g.strokeRect(pad - goalW, (H - goalH) / 2, goalW, goalH);
    this.drawGoalNet(g, pad - goalW, (H - goalH) / 2, goalW, goalH);

    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(W - pad - boxW, (H - boxH) / 2, boxW, boxH);
    g.strokeRect(W - pad - smallBoxW, (H - smallBoxH) / 2, smallBoxW, smallBoxH);
    g.lineStyle(3, 0xffd700, 1);
    g.strokeRect(W - pad, (H - goalH) / 2, goalW, goalH);
    this.drawGoalNet(g, W - pad, (H - goalH) / 2, goalW, goalH);

    g.lineStyle(2, 0xffffff, 1);
    const cr = 14;
    g.beginPath(); g.arc(pad, pad, cr, 0, Math.PI / 2); g.strokePath();
    g.beginPath(); g.arc(W - pad, pad, cr, Math.PI / 2, Math.PI); g.strokePath();
    g.beginPath(); g.arc(pad, H - pad, cr, -Math.PI / 2, 0); g.strokePath();
    g.beginPath(); g.arc(W - pad, H - pad, cr, Math.PI, (3 * Math.PI) / 2); g.strokePath();
  }

  private drawGoalNet(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number) {
    const rows = 4;
    const cols = 4;
    g.lineStyle(1, 0xc7d2fe, 0.4);

    for (let i = 1; i < rows; i++) {
      const offsetY = y + (height * i) / rows;
      g.lineBetween(x, offsetY, x + width, offsetY);
    }

    for (let i = 1; i < cols; i++) {
      const offsetX = x + (width * i) / cols;
      g.lineBetween(offsetX, y, offsetX, y + height);
    }

    g.lineStyle(2, 0xffffff, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + width, y);
    g.lineTo(x + width, y + height);
    g.strokePath();
  }
}
