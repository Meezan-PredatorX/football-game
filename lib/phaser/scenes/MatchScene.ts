import Phaser from "phaser";

export class MatchScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
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
  private timerEvent?: Phaser.Time.TimerEvent;
  private matchState: "firstHalf" | "halfTime" | "secondHalf" | "ended" = "firstHalf";
  private elapsedSeconds = 0;
  private isResetting = false;

  private W = 0;
  private H = 0;
  private pad = 40;

  private readonly HALF_DURATION_SECONDS = 45 * 60;
  private readonly TIME_SCALE = 60; // 1 real second = 60 in-game seconds for quicker demo timing
  private readonly HALFTIME_SECONDS = 1; // minimal transition before second half

  private readonly PLAYER_SPEED = 250;
  private readonly CPU_SPEED = 200;
  private readonly KICK_FORCE = 500;

  // Goal bounds (set in create)
  private leftGoalX = 0;
  private rightGoalX = 0;
  private goalTop = 0;
  private goalBottom = 0;

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
    this.spawnEntities();
    this.setupInput();
    this.setupScore();
    this.setupTimer();
    this.startMatchClock();
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

    // Player (blue, left side)
    this.player = this.add.circle(W * 0.25, H / 2, 14, 0x3b82f6);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // CPU (red, right side)
    this.cpu = this.add.circle(W * 0.75, H / 2, 14, 0xef4444);
    this.physics.add.existing(this.cpu);
    (this.cpu.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // Kick overlaps
    this.physics.add.overlap(this.player, this.ball, this.kickBall, undefined, this);
    this.physics.add.overlap(this.cpu, this.ball, this.kickCPU, undefined, this);
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
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

  private startMatchClock() {
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: this.updateMatchClock,
      callbackScope: this,
    });
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
    this.isResetting = false;
    this.resetPositions("player");
    this.setEntitiesKinematics(0, 0);
    this.updateTimerText();
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

    ballBody.setVelocity(ballVelocityX, ballVelocityY);
    playerBody.setVelocity(0, 0);
    cpuBody.setVelocity(0, 0);
  }

  private kickBall() {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const angle = Phaser.Math.Angle.Between(
      this.player.x, this.player.y,
      this.ball.x, this.ball.y
    );
    const speed = Math.sqrt(playerBody.velocity.x ** 2 + playerBody.velocity.y ** 2);
    const force = Math.max(speed * 1.5, this.KICK_FORCE * 0.5);
    ballBody.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
  }

  private kickCPU() {
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    const cpuBody = this.cpu.body as Phaser.Physics.Arcade.Body;

    const angle = Phaser.Math.Angle.Between(
      this.cpu.x, this.cpu.y,
      this.leftGoalX, this.H / 2
    );

    // Use CPU's current speed to add power, minimum force guaranteed
    const cpuSpeed = Math.sqrt(cpuBody.velocity.x ** 2 + cpuBody.velocity.y ** 2);
    const force = Math.max(cpuSpeed * 1.5, this.KICK_FORCE * 0.8);

    ballBody.setVelocity(
      Math.cos(angle) * force,
      Math.sin(angle) * force
    );
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
      // Conceding team gets kickoff — ball placed on their half
      this.resetPositions(scorer === "player" ? "cpu" : "player");
      this.isResetting = false;
    });
  }

  private resetPositions(kickoff: "player" | "cpu") {
    const { W, H } = this;

    // Ball slightly on kickoff team's side
    const ballX = kickoff === "player" ? W * 0.48 : W * 0.52;
    this.ball.setPosition(ballX, H / 2);
    (this.ball.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.player.setPosition(W * 0.25, H / 2);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.cpu.setPosition(W * 0.75, H / 2);
    (this.cpu.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  private updateCPU() {
    const cpuBody = this.cpu.body as Phaser.Physics.Arcade.Body;
    const dist = Phaser.Math.Distance.Between(
      this.cpu.x, this.cpu.y,
      this.ball.x, this.ball.y
    );

    // Target: chase ball if on CPU side, else guard goal
    const target = this.ball.x > this.W / 2
      ? { x: this.ball.x, y: this.ball.y }
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
    const speed = isGuarding && dist > 80
      ? this.CPU_SPEED * 0.6
      : this.CPU_SPEED;

    cpuBody.setVelocity(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    );
  }

  update() {
    if (this.isResetting) return;

    // Player movement
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setVelocity(0, 0);

    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;

    if (up) playerBody.setVelocityY(-this.PLAYER_SPEED);
    if (down) playerBody.setVelocityY(this.PLAYER_SPEED);
    if (left) playerBody.setVelocityX(-this.PLAYER_SPEED);
    if (right) playerBody.setVelocityX(this.PLAYER_SPEED);

    if ((up || down) && (left || right)) {
      playerBody.velocity.normalize().scale(this.PLAYER_SPEED);
    }

    this.updateCPU();
    this.checkGoal();
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

    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(W - pad - boxW, (H - boxH) / 2, boxW, boxH);
    g.strokeRect(W - pad - smallBoxW, (H - smallBoxH) / 2, smallBoxW, smallBoxH);
    g.lineStyle(3, 0xffd700, 1);
    g.strokeRect(W - pad, (H - goalH) / 2, goalW, goalH);

    g.lineStyle(2, 0xffffff, 1);
    const cr = 14;
    g.beginPath(); g.arc(pad, pad, cr, 0, Math.PI / 2); g.strokePath();
    g.beginPath(); g.arc(W - pad, pad, cr, Math.PI / 2, Math.PI); g.strokePath();
    g.beginPath(); g.arc(pad, H - pad, cr, -Math.PI / 2, 0); g.strokePath();
    g.beginPath(); g.arc(W - pad, H - pad, cr, Math.PI, (3 * Math.PI) / 2); g.strokePath();
  }
}