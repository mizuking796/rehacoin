# RehaCoim Gamification Implementation Plan

## Phase 1: Core Systems + Effects ✅
- [x] Coin fly animation (coins fly to header counter)
- [x] Rolling number counter (header coins animate)
- [x] Level/Rank system (Bronze→Silver→Gold→Platinum→Diamond)
- [x] Title system (ranks with Japanese names)
- [x] Streak fire icon (color changes by streak length)
- [x] Level-up flash + confetti
- [x] Random bonus multiplier (10% x2, 1% x5 on mining)

## Phase 2: Login Bonus + Rewards ✅
- [x] 7-day escalating login bonus (calendar UI + stamp animation)

## Phase 3: Collection + Exchange ✅
- [x] Badge expansion (category-based, streak-based, social, witness)
- [x] Badge reveal animation (3D spin + particles + confetti)
- [x] Badge condition display fix (streak/records/friends/witness)
- [x] Profile rank frame (rank-colored glow border on avatar)
- [x] Profile rank title display
- [x] Theme/skin store (6 themes: default/sakura/ocean/forest/night/sunset)
- [x] Theme persistence + auto-apply on init

## Phase 4: Social + Gacha ✅
- [x] Friend ranking (total coins leaderboard)
- [x] Daily gacha (card flip + rarity glow + 4 tiers)
- [x] Daily missions (3 random objectives per day + coin rewards)
- [ ] Coin history timeline (unified log) — requires Worker API

## Animation Library
- canvas-confetti (6KB) - only external dependency
- All else: CSS keyframes + Web Animations API

## Rank Tiers
| Rank | Coins | Color | Japanese |
|------|-------|-------|----------|
| Bronze | 0+ | #CD7F32 | リハビリ見習い |
| Silver | 50+ | #C0C0C0 | リハビリ初段 |
| Gold | 200+ | #FFD700 | リハビリ戦士 |
| Platinum | 500+ | #E5E4E2 | リハビリ達人 |
| Diamond | 1000+ | #B9F2FF | リハビリマスター |

## Streak Fire Colors
| Days | Color | Emoji |
|------|-------|-------|
| 1-2 | orange | 🔥 |
| 3-6 | red-orange | 🔥 |
| 7-29 | red | 🔥 |
| 30+ | blue | 🔥 |

## Gacha Rarity
| Rarity | Chance | Color | Coins |
|--------|--------|-------|-------|
| Common | 60% | #9E9E9E | 1 |
| Uncommon | 25% | #4CAF50 | 3 |
| Rare | 12% | #2196F3 | 5 |
| Legendary | 3% | #FFD700 | 10 |

## Daily Missions Pool
- Record 1/3/5 activities
- Cheer 1/3 friends
- Keep streak
