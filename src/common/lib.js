// common/lib.js
/**
 * ============================================================
 * ★ 汇聚出口(唯一职责: 重新导出)
 * ============================================================
 * 保持旧版页面 `import xxx from "../../common/lib.js"` 的路径不变,
 * 页面无需关心内部模块如何组织。
 *
 * 模块划分(按职责, 目录 = 管理层, 前缀 = 阅读层):
 *   core/core_*.js  - 引擎机制层: core_basics(数值修改唯一入口) / core_skill(技能执行器)
 *                     core_effect(效果执行器) / core_utils / core_economy / core_draw
 *   skill/fun_*.js  - 函数实现层(fun=函数): fun_skill(skill_LIB) / fun_effect(effect_LIB)
 *                     fun_details(描述库) / fun_preferences(行动偏好)
 *   data/*.js       - 数据表 + 工厂: cards / mobs / presets / relics
 *   game.js         - 存档服务(loadAllPlayerInfos / saveForAuto)
 *
 * 注意: pages 页面的非界面逻辑模块不经过本文件(见 pages/fighting/flow.js、
 *       pages/reward/fire.js 等, 与页面同文件夹, 由页面直接 import)。
 *
 * 新增能力流程: 在对应模块实现 -> 此文件自动导出(export *)。
 */

export * from "./core/core_basics.js"
export * from "./core/core_skill.js"
export * from "./core/core_effect.js"
export * from "./core/core_utils.js"
export * from "./core/core_economy.js"
export * from "./core/core_draw.js"

export * from "./data/cards.js"
export * from "./data/mobs.js"
export * from "./data/presets.js"
export * from "./data/relics.js"
export * from "./data/generators.js"

export * from "./skill/fun_skill.js"
export * from "./skill/fun_effect.js"
export * from "./skill/fun_details.js"

export * from "./game.js"
