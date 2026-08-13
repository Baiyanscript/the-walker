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
 *   - 节点复用 map 页面的平铺节点结构, 仅 rlevel 支持 "hard" 快捷值
 *     (展开为 ceil(stage/10)+2, 与随机战斗的困难奖励公式一致)
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
            { rpushKey: "商店", rlevel: "hard" },
            { rpushKey: "篝火", rlevel: "hard" },
            { rpushKey: "融合卡牌", rlevel: "hard" },
            { rpushKey: "获得卡牌", rlevel: "hard" },
            { rpushKey: "强化卡牌", rlevel: "hard" },
            { rpushKey: "遗物", rlevel: "hard" }
        ]
    },
    // 第25层: 固定中期 BOSS 战(老渔夫, 需求.md 2026-08-13), 胜利后 BOSS 奖励
    25: {
        nodes: [
            {
                rpushKey: "获得卡牌",
                rlevel: "hard",
                isHard: true,
                mobLevel: 1,
                mobSet: [{ addMob: [{ key: "老渔夫" }] }],
                exDate: { isBoss: true }
            }
        ]
    },
    // 第50层: 固定 BOSS 战(MC好成), 胜利后 100% 奖励卡牌(isBoss 标记)
    50: {
        nodes: [
            {
                rpushKey: "获得卡牌",
                rlevel: "hard",
                isHard: true,
                mobLevel: 1,
                mobSet: [{ addMob: [{ key: "MC好成" }] }],
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
        if (!SUPPORTED_RPUSH.includes(node.rpushKey)) return null
        if (node.rlevel !== undefined && node.rlevel !== "hard" && typeof node.rlevel !== "number") return null
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
    "富二代少爷": {
        maxHP: 80, // 脆皮: 比战士少 20 血
        HP: 80,
        goldNum: 10, // 富家公子体验生活
        maxAP: 8,
        maxHoldCard: 8,
        getCardNum: 3,
        effect: [],
        exDate: {},
        levelScript: {
            1: { nodes: [{ rpushKey: "商店" }] } // 角色专属: 第一层必然是无怪物的商店
        },
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
