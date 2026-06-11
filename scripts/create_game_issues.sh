#!/usr/bin/env bash
# Bulk-create 100 game design issues for the Astrocade-inspired catalog.
# Each issue follows a uniform spec template so downstream skills (analyst /
# developer / tester) can pick them up without further refinement.
set -euo pipefail

REPO="zhuam/crabcli-demo"
DRY="${DRY:-0}"

create_issue() {
  local title="$1"
  local genre="$2"
  local pitch="$3"
  local loop="$4"
  local controls="$5"
  local win="$6"
  local progression="$7"
  local body
  body=$(cat <<EOF
## 一句话立意
$pitch

## 类型 / Genre
$genre

## 核心玩法循环 (Core Loop)
$loop

## 操作方式 / Controls
$controls

## 胜负 / 结算规则
$win

## 进阶与成长 (Progression)
$progression

## 验收标准 (Acceptance Criteria)
- [ ] 首屏 3 秒内可进入游玩，无需教程
- [ ] 单局时长 ≤ 3 分钟，符合 Astrocade 短时长品类
- [ ] 触屏 / 鼠标 / 键盘三种输入至少支持两种
- [ ] 失败 / 胜利结算页有清晰的"再来一局"按钮
- [ ] 关键音效与震动反馈齐全
- [ ] 通关或失败时记录最高分到本地存储

---
*Inspired by gameplay patterns observed on https://www.astrocade.com/*
EOF
)

  if [[ "$DRY" == "1" ]]; then
    echo "DRY: $title"
    return 0
  fi
  if grep -Fxq "$title" /tmp/existing_titles.txt 2>/dev/null; then
    echo "⏭  $title (exists)"
    return 0
  fi
  local attempt=0
  while (( attempt < 5 )); do
    if gh issue create --repo "$REPO" --title "$title" --body "$body" >/dev/null 2>/tmp/gh_err; then
      echo "✓ $title"
      return 0
    fi
    attempt=$((attempt+1))
    echo "… retry $attempt for $title ($(cat /tmp/gh_err | head -1))"
    sleep $((attempt * 3))
  done
  echo "✗ FAILED $title"
  return 1
}

# Format: title|genre|pitch|loop|controls|win|progression
GAMES=(
  "[Game 001] Neon Block Pop|休闲/消除|霓虹色方块满屏，玩家三连消除获取连击分数|点击同色方块组 → 消除得分 → 掉落补位 → 触发连锁|单指点击 / 鼠标左键|限时 60 秒内得分排行，目标分数解锁下一关|每 5 关解锁一种新颜色与道具"
  "[Game 002] Stickman Archer Duel|动作/物理射击|火柴人对战，靠重力与角度计算箭矢轨迹|拉弓 → 瞄准 → 释放，根据弹道命中对方|长按拖拽（移动端）/ 鼠标拖拽|3 局 2 胜，命中头部一击必杀|每关解锁新箭矢（火、冰、爆炸）"
  "[Game 003] Cube Labyrinth Roll|益智/迷宫|滚动 3D 方块通过狭窄迷宫，方向决定方块朝向|每次操作旋转 90°，需保证落地稳定不掉出边界|方向键 / 滑动手势|抵达终点旗帜算赢，掉落即失败|每 10 关引入新机关（移动板、传送门）"
  "[Game 004] Pirate Gold Merge|合成/收集|拖动相同等级金币合并升级，目标拼出传说级宝藏|拖拽合并 → 解锁更高级单位 → 兑换金币|拖拽（触屏 / 鼠标）|凑齐 7 种宝藏触发结算胜利动画|金币产出速率随等级提升"
  "[Game 005] Sky Guardian 3D|3D 飞行/射击|驾驶飞船在峡谷中穿梭并击落入侵者|前后左右控制 + 自动射击 + 闪避陨石|WASD + 鼠标 / 摇杆|血量归零结束，分数 = 时间×敌机数|每 30 秒升级一次武器"
  "[Game 006] Mushroom Kingdom Run|横版跑酷|蘑菇主角在像素王国奔跑，躲避水管与敌人|自动前进 → 跳跃 / 下蹲 / 二段跳 → 收集金币|空格跳跃 / 屏幕点击|被击中 3 次结束，最远距离为目标|关卡场景每 500 米切换主题"
  "[Game 007] Chess Online Blitz|策略/对战|2 分钟+1 秒增量在线国际象棋|经典国象规则，倒计时归零判负|拖拽棋子 / 点击格子|王被将死或对方超时即胜|根据 ELO 自动匹配对手"
  "[Game 008] Punch Monkey Cafe|经营/模拟|猴子咖啡馆里接单制作饮品，时间就是利润|看订单 → 拖配料 → 出杯 → 上桌|拖拽 + 点击|3 天内达成目标利润视为成功|每天解锁新菜单与厨具升级"
  "[Game 009] Realistic Hair Salon|模拟/装扮|为客人洗剪吹染，按要求完成造型|选工具 → 操作头发 → 客人评分|拖拽工具到头发部位|3 星评价过关，连续好评解锁明星客户|店铺装饰持续升级"
  "[Game 010] Grand Line Sailing|RPG/冒险|海贼船队在伟大航路上探索岛屿、招募船员|地图航行 → 战斗 → 招募 → 升级船只|地图点击 + 战斗触屏|抵达终点岛屿即通关|船员等级与技能树成长"
  "[Game 011] Pixel Tower Stack|休闲/堆叠|落下的方块要精准对齐，错位部分会消失|每次按下按钮锁定当前方块|空格 / 屏幕点击|塔倒或方块归零失败|新高度解锁主题皮肤"
  "[Game 012] Era Civilization.io|.io 策略|实时占领格子扩张文明，与他人争霸|画线圈地 → 占领格子 → 抢夺资源|拖动方向控制角色|被切断尾部死亡，排行榜实时|发展阶段：石器→工业→未来"
  "[Game 013] Magic Bubble Shooter|消除/瞄准|经典泡泡龙：发射同色泡泡形成 3 连消除|瞄准 → 发射 → 消除 → 下降|拖拽瞄准 / 鼠标移动|清空顶部泡泡通关，触底失败|每 5 关引入新泡泡（彩虹、炸弹）"
  "[Game 014] Neptune Drift|赛车/竞速|海王星表面的反重力悬浮赛车竞速|油门 + 漂移 + 喷射加速|方向键 / 触屏左右按钮|前 3 名进入下一赛段|车辆改装与赛道解锁"
  "[Game 015] Equation Quest|教育/数学|解出方程式才能让英雄前进一步|看题 → 选答案 → 角色推进|点击选项|时间内通关获得三星|题目难度阶梯式增长"
  "[Game 016] Rail in Air|物理/建造|空中铺铁轨连接城市，避免悬空塌陷|放置铁轨 → 列车启动 → 抵达车站|拖拽轨道块|列车成功抵达终点|新城市解锁地形挑战"
  "[Game 017] Unseen Caller 2|恐怖/解谜|接听神秘来电，根据声音线索找出真相|对话选项 → 探索房间 → 收集物品|点击 / 拖动|找出来电者身份过关|多结局分支"
  "[Game 018] Barbie Fashion Color|涂色/创意|为芭比时装填色，作品可分享到画廊|选颜色 → 点区域填色 → 提交|点击 / 拖动|完成作品解锁新模板|社区点赞排行"
  "[Game 019] Mech Merge Battle|合成/战斗|合并机甲零件组装战斗单位上场|工厂合并 → 派遣战场 → 自动战斗|拖拽合并 + 部署|击败 Boss 战胜|新机甲蓝图解锁"
  "[Game 020] 99 Nights Survival|生存/防御|99 个夜晚轮番抵御僵尸潮，白天补给|白天采集 → 建防御 → 夜晚战斗|WASD + 鼠标射击|撑过 99 夜通关|武器与建筑升级树"
  "[Game 021] Block Bliss|放置/装饰|空白画布上自由拼出像素艺术作品|选方块 → 放置 → 旋转 → 分享|拖拽 + 双指缩放|作品获 10 个赞解锁高级方块|主题挑战每周更新"
  "[Game 022] Cupid Ricochet|物理/弹射|爱神之箭反弹击中所有目标|拖拽蓄力 → 释放 → 反弹路径|拖拽瞄准|一击命中所有红心通关|新关卡机关：传送、镜面"
  "[Game 023] Neon Circuit Connect|益智/连线|连接霓虹电路点，路径不能交叉|画线 → 连接同色点 → 填满网格|拖拽划线|所有点连接成功通关|网格尺寸递增"
  "[Game 024] Emoji Smash Arena|对战/休闲|表情包大乱斗，按节奏拍打出现的对手 emoji|看准位置 → 点击 → 连击加分|快速点击|血量耗尽失败|表情角色解锁与皮肤"
  "[Game 025] Grow A Pets 3D|养成/收集|喂养小宠物长大并进化成稀有形态|喂食 → 互动 → 进化 → 配对|拖拽食物 + 抚摸|集齐图鉴通关|进化分支多种"
  "[Game 026] Wishing Cauldron|合成/魔法|魔药大锅按配方放材料，调出指定颜色|拖材料 → 搅拌 → 倒入瓶子|拖拽 + 滑动搅拌|完成订单获报酬|新配方与稀有素材解锁"
  "[Game 027] AstroDash Runner|跑酷/太空|宇航员在小行星表面狂奔躲避撞击|跳 → 滑 → 切换轨道|左右滑动 / 方向键|血量归零失败，最远距离排行|新星球与坐骑解锁"
  "[Game 028] Monorail Pilot|模拟/驾驶|驾驶单轨列车按时停靠并控制车速|加速 → 刹车 → 进站|按键 + 鼠标|准时抵达终点获星|新线路与车型解锁"
  "[Game 029] Pet Hair Panic|时间管理|宠物美容店剪毛染色，多客同时服务|拖剪刀 → 染色 → 结账|拖拽工具|目标营收达成过关|新宠物品种与发型解锁"
  "[Game 030] Pirate Gambit Cards|卡牌/对战|海盗牌局，类似德州的桌游变体|发牌 → 押注 → 比大小|点击操作|赢光对手筹码获胜|新海盗对手 AI 风格"
  "[Game 031] Roach Rampage|动作/混乱|扮演蟑螂在厨房逃窜不被拖鞋拍到|跑动 → 躲藏 → 偷食|WASD + 鼠标|偷到所有食物且不死过关|新地图与道具"
  "[Game 032] Brainrot Heist|潜行/策略|脑腐角色组队抢银行，需配合时间窗口|分配角色 → 触发动作 → 撤离|拖拽时间轴|抢到金库且全员撤离胜利|新关卡需更复杂规划"
  "[Game 033] Galaxtor TD|塔防/策略|外星基地搭建炮塔抵御波次入侵|放置炮塔 → 升级 → 抗波|拖放 + 点击升级|抵御 20 波过关|新炮塔解锁与天赋"
  "[Game 034] Tank Rumble|对战/坦克|两位玩家 / AI 在格子地图上互射坦克|移动 → 瞄准 → 射击|方向键 + 空格|对手坦克归零胜利|新地形与坦克类型"
  "[Game 035] Hard500 Final KM|赛车/耐力|最后 250 公里耐力赛，需精打细算油耗|油门 → 进站 → 维修|按键控制|完赛且名次靠前过关|车辆调教与轮胎选择"
  "[Game 036] Grumpy Defender|策略/防御|脾气暴躁的守城者，怒气越高伤害越高|放置防御 → 触发愤怒 → 反击|拖放 + 点击|城堡未陷落过关|新单位与连击系统"
  "[Game 037] Italian Chef Match|消除/烹饪|意大利大厨厨房，按食材三消解锁菜谱|滑动消除 → 集齐食材 → 上菜|滑动手势|限步内完成订单|每周菜谱挑战"
  "[Game 038] Save the Doge|益智/画线|画线保护小狗免受危险|画线 → 形成障碍 → 物理模拟|拖拽画线|阻止所有威胁过关|关卡机关多样"
  "[Game 039] Big Boi Eats|休闲/吞噬|大胖子吞掉小物体不断变大|移动吞噬 → 等级提升 → 解锁地图|鼠标 / 触屏移动|达到目标体重过关|新角色皮肤解锁"
  "[Game 040] Sneak the Fart|搞笑/潜行|偷偷在公共场合放屁不被发现|时机选择 → 释放 → 隐藏|空格 / 点击|集齐目标释放数过关|新场景与音效"
  "[Game 041] Garden Keeper|放置/种植|管理花园种植与浇水，离线产出|种植 → 浇水 → 收获 → 卖出|拖拽 + 点击|金币达成目标过关|新作物与温室"
  "[Game 042] Gridlock Garden|益智/拼图|植物按网格规则种入花园解开谜题|拖植物 → 满足相邻规则|拖放|完成所有格子过关|关卡递增难度"
  "[Game 043] Grow a Garden Idle|放置/挂机|无尽花园挂机，离线也产出金币|轻点 → 收获 → 升级|点击 + 升级|达成全图鉴通关|稀有花卉解锁"
  "[Game 044] Enchanted Garden Match|消除/魔法|魔法花园里三消触发法术，攻破暗影|消除 → 法术 → 击败 Boss|滑动消除|击败章节 Boss 通关|新法术与卡组"
  "[Game 045] Grandma Garden Grub|烹饪/休闲|奶奶花园采摘食材做菜分享|采摘 → 烹饪 → 配送|点击 + 拖放|订单完成度过关|新食谱与花园扩建"
  "[Game 046] Slime Ascent|平台跳跃|史莱姆向上跳跃，吸附墙壁继续攀升|跳跃 → 粘附 → 反弹|空格 + 方向|抵达云端通关|新机关与皮肤"
  "[Game 047] Chaos Race|多人/混乱|多人闯关赛跑，随机机关捣乱|跑动 → 跳跃 → 躲机关|方向键|前 3 名晋级|新赛道每周轮换"
  "[Game 048] SpongeBob Art Quest|涂色/休闲|海绵宝宝带你完成画作收集|看模板 → 涂色 → 完成|点击颜色|完成度 100% 过关|解锁角色画作"
  "[Game 049] Gravity Warp Kingdom|物理/解谜|按按钮翻转重力，让角色到达终点|按钮 → 翻转重力 → 移动|按键|抵达旗帜过关|新机关与多向重力"
  "[Game 050] Bridge Builder Frenzy|物理/建造|搭建桥梁承受货车通过的重量|放置梁 → 测试 → 调整|拖放梁 + 测试按钮|车成功通过过关|预算限制与材料解锁"
  "[Game 051] Castle Clash Rush|RTS/部署|出兵推塔，资源与兵种克制|采集 → 出兵 → 推进|点击单位|摧毁敌方主城胜利|新兵种与英雄"
  "[Game 052] Bridge Brawl 3D|对战/物理|对抗式抢桥战，把对手撞下桥|奔跑 → 撞击 → 抢位|WASD + 空格|撑到最后存活胜利|新地图与道具"
  "[Game 053] City Racer Neon|赛车/夜跑|霓虹都市赛车，避警车与对手|油门 + 漂移|方向键|首先抵达终点|新车与改装"
  "[Game 054] Ricochet Rumble|射击/弹射|子弹会反弹的回合制射击对战|瞄准 → 射击 → 反弹击杀|拖拽瞄准|消灭对手胜利|新关卡机关"
  "[Game 055] Arena Blitz|MOBA-Lite|3v3 快节奏对战，技能驱动|走位 → 释放技能 → 推塔|双摇杆|摧毁敌方核心胜利|新英雄与皮肤"
  "[Game 056] Beach Babes Volleyball|沙滩排球|休闲体育对战，跳扣救球|移动 → 跳跃 → 扣球|方向键 + 空格|3 局 2 胜|新角色与场地"
  "[Game 057] Evil Brother 2|搞笑/恶作剧|对哥哥进行无伤大雅的恶作剧|选道具 → 实施 → 评分|点击触发|集齐成就过关|新道具与场景"
  "[Game 058] Chat Master|互动/剧情|聊天恋爱模拟，根据回复推进剧情|阅读 → 选答案 → 推进|点击选项|达成目标好感度通关|多角色多结局"
  "[Game 059] Texting Terror|惊悚/解谜|短信悬疑解谜，从对话中找出凶手|读消息 → 调查 → 推理|点击 + 拖放|找到真凶通关|多结局"
  "[Game 060] My Talking Luntik|养成/陪伴|养小宠物，喂食洗澡讲故事|互动按钮|点击触发|友好度满级通关|新装扮与小游戏"
  "[Game 061] Skyport Cardhouse|卡牌/Roguelike|搭叠卡牌房屋，每张卡都有技能|抽卡 → 放置 → 触发|拖放卡牌|抵达卡屋顶层通关|新卡牌与流派"
  "[Game 062] Wheel-o-Mon Showdown|宝可梦+轮盘|转轮盘决定技能进行回合制对战|旋转轮盘 → 触发技能|点击 + 拖动|对手血量归零胜利|新宠物与技能"
  "[Game 063] Connect Four Online|对战/棋类|经典四子棋，在线匹配|放子 → 阻挡 → 连成|点击列|四连珠胜利|匹配对手 ELO"
  "[Game 064] Battle Dogs Arena|宠物对战|狗狗组队战斗，技能克制|组队 → 派出 → 自动战斗|拖拽 + 点击|赢得回合胜利|新犬种与训练"
  "[Game 065] Slime Siege|塔防/史莱姆|可爱史莱姆塔防御主城|放塔 → 升级 → 抗波|拖放|抵御所有波次|新塔与符文"
  "[Game 066] We Bare Bears Blocks|消除/IP|熊熊三兄弟主题三消|消除 → 任务目标|滑动|完成任务通关|新主题与限时活动"
  "[Game 067] Stretch Arm Bank Job|物理/搞笑|手臂延伸偷取金库内现金|延伸 → 抓取 → 撤回|拖拽控制|偷够金额且不触警报|新机关与道具"
  "[Game 068] Memory Match Pairs|益智/记忆|翻牌找对，时间挑战|翻牌 → 记忆 → 配对|点击|限时配齐过关|主题图集解锁"
  "[Game 069] Minecraft Pixel Puzzle|拼图/像素|马赛克拼图重建经典 MC 画面|拖块 → 拼成图案|拖拽|完成图案通关|新图片解锁"
  "[Game 070] Sort Till You Cant|益智/分类|颜色水管分类，倒入相同颜色|点击瓶子 → 倒出|点击|所有瓶纯色过关|新关卡与机关瓶"
  "[Game 071] Auto Spa Dash|经营/洗车|多车位洗车店，洗车打蜡擦干|拖工具 → 步骤完成|拖拽|目标营收过关|新车与设备升级"
  "[Game 072] Paws & Claws Clinic|模拟/医疗|宠物诊所，诊断治疗护理|检查 → 诊断 → 治疗|拖拽 + 点击|满意度过关|新病例与设备"
  "[Game 073] Baby Shark Manicure|涂色/休闲|为鲨鱼宝宝美甲，色彩搭配|选色 → 涂指 → 装饰|拖拽|完成所有指甲过关|新主题美甲款式"
  "[Game 074] Case Crafters|设计/手工|定制手机壳贴纸印花|拖图案 → 排版 → 制作|拖拽缩放|交付订单获评分|新模板解锁"
  "[Game 075] Sparkle Sweep|清洁/休闲|擦亮脏污区域，治愈感|滑动 → 清洁 → 露出底图|滑动手势|清洁 100% 过关|新场景解锁"
  "[Game 076] Barbie Wedding Nails|涂色/装扮|芭比婚礼美甲，主题挑战|选色 → 装饰 → 完成|拖拽|3 星评价过关|新主题婚礼"
  "[Game 077] Color Mosaic|涂色/像素|按编号涂色完成马赛克作品|选编号 → 点格涂色|点击|完成图通关|新作品解锁"
  "[Game 078] Photo Puzzle Restore|拼图/照片|被打乱的照片需重新还原|拖块 → 还原|拖拽|时间内完成过关|新照片包"
  "[Game 079] Mario Pixel Painter|涂色/IP|超级马里奥主题像素涂色|选色 → 涂格|点击|完成画作通关|新关卡画"
  "[Game 080] Guinea Pig Jigsaw|拼图/可爱|豚鼠主题拼图|拖块 → 拼接|拖拽|完成通关|新照片与难度"
  "[Game 081] Speed Cube Solver|益智/魔方|3D 魔方速拧挑战|旋转面 → 还原|拖拽旋转|限时还原过关|新尺寸 4×4 5×5"
  "[Game 082] Pizza Stack Frenzy|休闲/堆叠|订单要求堆叠特定配料的披萨|拖配料 → 堆叠 → 出炉|拖拽|订单完成过关|新配料解锁"
  "[Game 083] Idle Coffee Tycoon|放置/经营|经营咖啡帝国，挂机产收益|升级店铺 → 招员工 → 扩张|点击 + 升级|全图开店通关|新城市与饮品"
  "[Game 084] Tank Battalion 2D|射击/经典|2D 坦克守卫基地|移动 → 射击 → 防御|方向键 + 空格|波次撑到结束|新坦克与道具"
  "[Game 085] Color Sort Balls|益智/排序|不同颜色的球排序入管|拖球 → 入管|拖拽|纯色入管过关|新关卡颜色"
  "[Game 086] Drift King Arena|赛车/漂移|限定赛道漂移积分|加速 + 漂移|方向键|目标积分过关|新车与赛道"
  "[Game 087] Cooking Marathon|时间管理|马拉松式烹饪订单，多锅同时进行|拖食材 → 烹饪 → 上菜|拖拽 + 点击|完成订单数过关|新菜与厨具"
  "[Game 088] Zombie Last Hill|生存/射击|站在山头抵御僵尸潮|瞄准 → 射击 → 换弹|鼠标 + 键盘|撑过所有波次|新武器与角色"
  "[Game 089] Bubble Tea Maker|模拟/餐饮|手工调制珍珠奶茶|选茶底 → 加配料 → 摇匀|拖拽|订单 3 星过关|新口味解锁"
  "[Game 090] Hyper Casual Hop|跳跃/简易|不断跳跃方块，命中节奏|按键跳|空格 / 点击|连跳分数排行|新音乐与配色"
  "[Game 091] Spaceship Builder|沙盒/建造|拼装飞船零件，发射上太空|拖零件 → 焊接 → 发射|拖拽|抵达目标高度过关|新零件解锁"
  "[Game 092] Detective Crime Board|解谜/推理|线索板上拼接证据找出凶手|线索拖拽 → 推理|拖拽|找出凶手通关|多案件解锁"
  "[Game 093] Sushi Master|经营/餐饮|寿司店出餐，节奏与精准并重|捏饭 → 加料 → 摆盘|拖拽|订单完成过关|新菜单解锁"
  "[Game 094] Idle Dungeon Heroes|放置/RPG|英雄自动闯关挂机|英雄派遣 → 装备 → 升级|点击 + 拖装备|全副本通关|新英雄与套装"
  "[Game 095] Knight vs Slime|动作/Roguelite|骑士在洞穴击退史莱姆|攻击 → 闪避 → 拾取|WASD + 鼠标|Boss 击杀通关|新武器与遗物"
  "[Game 096] Word Ladder Climb|文字/益智|改一个字母连成新词向上爬|输入词 → 验证|键盘|爬到顶层通关|新主题词库"
  "[Game 097] Pet Run.io|.io 跑酷|多人在线萌宠赛跑|跑 → 跳 → 撞|方向键|前 3 名晋级|新宠物外观"
  "[Game 098] Solar Snake|经典/休闲|宇宙版贪吃蛇，吃星变长|方向 → 吃星|方向键 / 滑动|碰撞结束，分数排行|新皮肤与场景"
  "[Game 099] Idle Lemonade Stand|经营/放置|柠檬水摊扩张全城|价格 → 招员 → 升级|点击 + 升级|帝国上市通关|新口味与门店"
  "[Game 100] Astrocade Trivia Royale|问答/对战|多人在线知识竞答|读题 → 选答 → 计分|点击|前 3 名晋级|新题库每周更新"
)

echo "Total games: ${#GAMES[@]}"
echo "Fetching existing issues to skip duplicates..."
gh issue list --repo "$REPO" --state all --limit 500 --json title --jq '.[].title' > /tmp/existing_titles.txt 2>/dev/null || : > /tmp/existing_titles.txt
echo "Existing: $(wc -l < /tmp/existing_titles.txt)"
for entry in "${GAMES[@]}"; do
  IFS='|' read -r title genre pitch loop controls win progression <<< "$entry"
  create_issue "$title" "$genre" "$pitch" "$loop" "$controls" "$win" "$progression"
done
echo "All issues created."
