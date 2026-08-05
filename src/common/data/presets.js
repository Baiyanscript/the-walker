// common/data/presets.js
/**
 * ============================================================
 * 玩家预设表
 * ============================================================
 * 定义"新游戏"时可选的玩家初始配置。
 * 依赖 data/cards.js 的 createCard 生成初始卡牌池, 故 import 关系:
 *   data/presets.js -> data/cards.js
 *
 * 玩家对象字段规范(与怪物同构, 额外拥有):
 *   maxHP / HP      - 生命上限 / 当前生命
 *   maxAP / AP      - 行动点上限 / 当前行动点
 *   maxHoldCard     - 手牌上限
 *   getCardNum      - 每回合抽牌数
 *   goldNum         - 金币
 *   stage           - 当前关卡层数
 *   effect          - 效果列表(与怪物相同结构)
 *   initialCard     - 初始卡牌池(新游戏时写入牌库, 不入存档)
 */

import { createCard } from "./cards.js"

export const preset_LIB = {
    "战士": {
        maxHP: 100,
        HP: 100,
        maxAP: 8,
        maxHoldCard: 10, // 给多点
        getCardNum: 3,
        effect: [],
        exDate: {},
        initialCard: [
            createCard("斩击", { level: 1 }),
            createCard("斩击", { level: 2 }),
            createCard("持盾", { level: 2 }),
            createCard("持盾", { level: 1 }),
            createCard("横扫", { level: 2 }),
            createCard("斩击", { level: 1 })
        ]
    },
    "赌徒": {
        maxHP: 80, // 脆皮: 比战士少 20 血
        HP: 80,
        goldNum: 150, // 开局有钱: 前期商店奖励类型只要 rlevel*3, 可大量购入强化
        maxAP: 8,
        maxHoldCard: 8,
        getCardNum: 3,
        effect: [],
        exDate: {},
        initialCard: [
            createCard("斩击", { level: 1 }),
            createCard("斩击", { level: 2 }),
            createCard("攻防一体", { level: 1 }),
            createCard("淬毒", { level: 2 }),
            createCard("强效呼吸", { level: 1 }), // 突破 AP 上限 = 赌徒的爆发引擎
            createCard("贪婪之刃", { level: 1 }) // 打怪赚金币, 滚雪球
        ]
    }
}
