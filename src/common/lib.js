// common/lib.js
/**
 * ============================================================
 * ★ 汇聚出口(唯一职责: 重新导出)
 * ============================================================
 * 保持旧版页面 `import xxx from "../../common/lib.js"` 的路径不变,
 * 页面无需关心内部模块如何组织。
 *
 * 模块划分(按职责):
 *   core/basics.js   - 基础操作: 所有 HP/AP/DP 修改的唯一入口
 *   core/skill.js    - 技能执行器: buildSkillCtx(三角色ctx) / runSkill
 *   core/effect.js   - 效果执行器: doEffect / fireEffect / effectClear
 *   core/utils.js    - 纯工具: delay / generateUid
 *   data/cards.js    - 卡牌模板表 + 索引 + 工厂(createCard*)
 *   data/mobs.js     - 怪物模板表 + 索引 + 工厂(createMob*)
 *   data/presets.js  - 玩家预设表
 *   skills/skills.js - 技能库 skill_LIB(语义见 core/skill.js 注释)
 *   skills/effects.js- 效果库 effect_LIB
 *   skills/details.js- 描述库 detail_LIB + getXxxDetail
 *   game.js          - 存档服务(loadAllPlayerInfos / saveForAuto)
 *
 * 新增能力流程: 在对应模块实现 -> 此文件自动导出(export *)。
 */

export * from "./core/basics.js"
export * from "./core/skill.js"
export * from "./core/effect.js"
export * from "./core/utils.js"
export * from "./core/economy.js"
export * from "./core/draw.js"

export * from "./battle/flow.js"

export * from "./data/cards.js"
export * from "./data/mobs.js"
export * from "./data/presets.js"
export * from "./data/relics.js"

export * from "./skills/skills.js"
export * from "./skills/effects.js"
export * from "./skills/details.js"

export * from "./game.js"
