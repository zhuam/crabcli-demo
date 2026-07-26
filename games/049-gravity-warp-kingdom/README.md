# Gravity Warp Kingdom (重力翻转王国)

A physics puzzle platformer where pressing Space (or the on-screen FLIP button) reverses gravity, letting your character walk on ceilings and walls to reach the goal flag.

## How to Play

Navigate through 12 increasingly difficult levels by flipping gravity to traverse platforms, avoid spikes, and reach the glowing flag. The world tint shifts between cool cyan (normal gravity) and warm amber (flipped gravity).

## Controls

| Action | Keyboard | Touch/Mouse |
|--------|----------|-------------|
| Move Left | Arrow Left / A | Left D-pad button / tap left side |
| Move Right | Arrow Right / D | Right D-pad button / tap right side |
| Flip Gravity | Space / W / Arrow Up | FLIP button / tap center |

## Levels

| # | Name | Description |
|---|------|-------------|
| 1 | 入门 (Introduction) | Basic platforming with no hazards |
| 2 | 翻转 (Flip) | First introduction to gravity flipping |
| 3 | 尖刺 (Spikes) | Spike hazards on floors and ceilings |
| 4 | 迷宫 (Maze) | Multi-path platform layouts |
| 5 | 移动 (Moving) | Moving platforms require timing |
| 6 | 深渊 (Abyss) | Large gaps requiring mid-air flips |
| 7 | 连锁 (Chain) | Sequential gravity flips through narrow passages |
| 8 | 陷阱 (Traps) | Dense hazard placement |
| 9 | 迷宫II (Maze II) | Complex ceiling and floor navigation |
| 10 | 极速 (Speed) | Open layout designed for speed-running |
| 11 | 混沌 (Chaos) | All mechanics combined |
| 12 | 终极 (Ultimate) | Final challenge |

## Features

- Canvas-based 2D rendering with parallax city skyline
- Smooth 180-degree character rotation on gravity flip
- Particle effects and screen tint transitions
- Web Audio API sound effects (flip, death, win, star)
- Star rating system (1-3 stars based on completion time)
- Touch, mouse, and keyboard input
- Mobile-friendly responsive design
- Level progress and high scores saved to localStorage
- Haptic vibration feedback on mobile

## Star Times

Each level awards stars based on completion time:
- **3 stars**: Fast time (expert)
- **2 stars**: Moderate time (skilled)
- **1 star**: Clear the level (any time)
