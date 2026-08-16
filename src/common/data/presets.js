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
 *   exDate          - 预设自定义数据
 *   initialCard     - 初始卡牌池(新游戏时写入牌库, 不入存档)
 *   levelScript     - 可选: 固定层数脚本(特殊层数 -> 该层显示的固定节点)
 *
 * 固定层数脚本(levelScript):
 *   - 键 = 层数(int), 值 = { nodes: [节点...] }
 *   - 节点复用 map 页面的平铺节点结构, 仅 rewardLevel 支持 "hard" 快捷值
 *     (展开为 3, 与随机战斗的困难奖励公式一致; 2026-08-15 level隐藏方案: 固定不再随层数)
 *   - 命中即整层替换随机节点; 未命中/校验失败(见 getLevelScript)则走随机
 *   - 合并顺序: 先 GLOBAL_LEVEL_SCRIPT(全局) 后 preset.levelScript(角色), 角色覆盖全局同层
 */

import { createCard } from "./cards.js"
import { mob_LIB } from "./mobs.js"

/** 全局特殊层脚本: 所有职业通用(键 = 层数) */
export const GLOBAL_LEVEL_SCRIPT = {
    // 第49层: 固定 6 个高奖励入口(奖励等级按"困难"档, 含遗物)
    49: {
        nodes: [
            { rewardType: "商店", rewardLevel: "hard" },
            { rewardType: "篝火", rewardLevel: "hard" },
            { rewardType: "融合卡牌", rewardLevel: "hard" },
            { rewardType: "获得卡牌", rewardLevel: "hard" },
            { rewardType: "强化卡牌", rewardLevel: "hard" },
            { rewardType: "遗物", rewardLevel: "hard" }
        ]
    },
    // 第25层: 固定中期 BOSS 战(老渔夫, 需求.md 2026-08-13), 胜利后 BOSS 奖励
    // exDate.cardSource: 本层奖励卡牌的额外来源通行证(需求.md 2026-08-16 来源注入方式①)
    //   —— limit:["老渔夫"] 的卡(钓鱼佬的鱼竿)仅在本层可刷出; isBoss 自动追加 "BOSS" 来源
    25: {
        nodes: [
            {
                rewardType: "获得卡牌",
                rewardLevel: "hard",
                isHard: true,
                mobLevel: 1,
                mobSet: [{ addMob: [{ key: "老渔夫" }] }],
                exDate: { isBoss: true, cardSource: ["老渔夫"] }
            }
        ]
    },
    // 第50层: 固定 BOSS 战(MC好成), 胜利后 100% 奖励卡牌(isBoss 标记)
    50: {
        nodes: [
            {
                rewardType: "获得卡牌",
                rewardLevel: "hard",
                isHard: true,
                mobLevel: 1,
                mobSet: [{ addMob: [{ key: "MC好成" }] }],
                exDate: { isBoss: true }
            }
        ]
    },
    // 第75层: 固定后期 BOSS 战(铜制机械人偶, 需求.md 2026-08-13), 胜利后 BOSS 奖励
    75: {
        nodes: [
            {
                rewardType: "获得卡牌",
                rewardLevel: "hard",
                isHard: true,
                mobLevel: 1,
                mobSet: [{ addMob: [{ key: "铜制机械人偶" }] }],
                exDate: { isBoss: true }
            }
        ]
    }
}

/** 关卡支持的事件类型(与 map.ux 的 reward_weight / enter 分流保持一致) */
const SUPPORTED_RPUSH = ["商店", "强化卡牌", "篝火", "获得卡牌", "回收卡牌", "融合卡牌", "遗物"]

/**
 * 查询指定层数的固定脚本(全局 + 角色合并, 带校验)
 * @param {number} stage - 当前层数
 * @param {string} [presetKey] - 玩家预设键(playerInfo.presetKey; 旧存档可能缺失)
 * @returns {Object|null} { nodes: [...] }; 未命中或内容无效返回 null(调用方走随机)
 */
export function getLevelScript(stage, presetKey) {
    const preset = preset_LIB[presetKey]

    // 未命中任何层(全局与角色都没有) -> null
    if (!GLOBAL_LEVEL_SCRIPT[stage] && (!preset || !preset.levelScript || !preset.levelScript[stage])) {
        return null
    }

    // 合并: 先导入全局, 再导入角色(角色覆盖全局同层字段)
    const merged = { ...(GLOBAL_LEVEL_SCRIPT[stage] || {}) }
    if (preset && preset.levelScript && preset.levelScript[stage]) {
        Object.assign(merged, preset.levelScript[stage])
    }

    // 校验: 任一不满足 -> null(硬编码内容错误/失效则走原随机模式)
    if (!merged.nodes || !Array.isArray(merged.nodes) || merged.nodes.length === 0) {
        return null
    }
    for (const node of merged.nodes) {
        if (!node || typeof node !== "object") return null
        if (!SUPPORTED_RPUSH.includes(node.rewardType)) return null
        if (node.rewardLevel !== undefined && node.rewardLevel !== "hard" && typeof node.rewardLevel !== "number") return null
        if (node.mobSet && Array.isArray(node.mobSet)) {
            for (const wave of node.mobSet) {
                for (const m of (wave && wave.addMob) || []) {
                    const key = typeof m === "string" ? m : (m && m.key)
                    if (!key || !mob_LIB[key]) return null
                }
            }
        }
    }
    return merged
}

export const preset_LIB = {
    "战士": {
        maxHP: 100,
        HP: 100,
        maxAP: 8,
        maxHoldCard: 10, // 给多点
        getCardNum: 5,
        effect: [],
        exDate: {},
        // 来源标签(需求.md 2026-08-16 来源注入方式②): 奖励/商店按此过滤 limit 专属卡
        source: [], // 战士无专属卡池, 全部通用
        initialCard: [
            createCard("斩击", { level: 1 }),
            createCard("斩击", { level: 2 }),
            createCard("持盾", { level: 2 }),
            createCard("持盾", { level: 1 }),
            createCard("横扫", { level: 2 }),
            createCard("斩击", { level: 1 })
        ]
    },
    "富二代少爷": {
        maxHP: 80, // 脆皮: 比战士少 20 血
        HP: 80,
        goldNum: 10, // 富家公子体验生活
        maxAP: 8,
        maxHoldCard: 8,
        getCardNum: 5,
        effect: [],
        exDate: {},
        source: ["富二代"], // 来源标签: limit:["富二代"] 的专属卡仅本预设可刷
        levelScript: {
            1: { nodes: [{ rewardType: "商店" }] } // 角色专属: 第一层必然是无怪物的商店
        },
        initialCard: [
            createCard("斩击", { level: 1 }),
            createCard("斩击", { level: 2 }),
            createCard("攻防一体", { level: 1 }),
            createCard("淬毒", { level: 2 }),
            createCard("强效呼吸", { level: 1 }), // 突破 AP 上限 = 赌徒的爆发引擎
            createCard("贪婪之刃", { level: 1 }) // 打怪赚金币, 滚雪球
        ]
    },
    "失落引擎": {
        maxHP: 90, // 略脆: 比战士少 10 血
        HP: 90,
        maxAP: 8, // 高 AP: 球体系需要频繁出牌
        maxHoldCard: 10,
        getCardNum: 5,
        // 常驻: 出牌按 costAP 产球(0/1/2个)直接进手牌(需求.md 2026-08-13 球体系)
        effect: [{ key: "effect_orbGenerator", restTurn: "inf", level: 1, isRemove: false }],
        exDate: {},
        source: [], // 来源标签: 暂无专属卡
        initialCard: [
            createCard("斩击", { level: 1 }),
            createCard("持盾", { level: 1 }),
            createCard("快速充能", { level: 1 }), // 回 AP + 解毒
            // 开局不带球(球不进存档卡牌堆, 只由出牌产生): 补普通卡凑 6 张
            createCard("战吼", { level: 1 }), // 0费抽牌: 把洗回弃牌堆的球抽回手
            createCard("攻防一体", { level: 1 }), // 攻防一体(原铁斩波, 2026-08-15 生态位去重: 保留原创删尖塔移植)
            createCard("燃烧", { level: 1 }) // 1费本场力量+2: 越打越强
        ]
    },
    "混沌": {
        maxHP: 100,
        HP: 100,
        maxAP: 8,
        maxHoldCard: 10,
        getCardNum: 5,
        // 七咒之戒(纯 buff, 需求.md 2026-08-16): 七咒全部效果集中在一个常驻效果中
        //   (诅咒1/2 需新增 trigger, 下一轮对话实现; 本轮 only when_act 分支的诅咒3/4)
        effect: [{ key: "effect_sevenCurses", restTurn: "inf", level: 1, isRemove: false }],
        exDate: {},
        // 生成器声明(需求.md): 进入 map/reward 时按此提取, 提取失败/未定义回退 common
        map: {
            typeOfMap: "map_七咒",
            fire: "fire_七咒",
            cardGain: "cardGain_七咒"
        },
        // 来源标签(需求.md 2026-08-16): limit:["七咒"] 的专属卡仅本预设可刷(奖励/商店自动过滤)
        source: ["七咒"],
        initialCard: [
            createCard("斩击", { level: 1 }),
            createCard("斩击", { level: 2 }),
            createCard("持盾", { level: 2 }),
            createCard("持盾", { level: 1 }),
            createCard("横扫", { level: 2 }),
            createCard("斩击", { level: 1 })
        ]
    }
}
