// test/convert.mjs
/**
 * 将 src 下的 .js 模块转换为 .mjs 副本到 test/.cache/esm/,
 * 目录结构镜像 src(common/ 与 pages/ 两个根, 保持相对导入层级一致)。
 * 原因: 项目 package.json 无 "type": "module", node 会把 .js 当 CJS,
 *       而项目模块是 ESM 语法——测试只能从转换后的 .mjs 副本导入。
 * 副本目录已被 .gitignore 忽略, 运行 npm test 时自动重建。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.resolve(__dirname, ".cache/esm")

// 转换根: common(引擎/数据/技能) + pages(页面同文件夹的逻辑模块, 如 fighting/flow.js、reward/*.js)
// base 为镜像后的顶层目录名, 保证 .mjs 副本间的相对导入与原 src 树一致
const roots = [
  { dir: path.resolve(__dirname, "../src/common"), base: "common" },
  { dir: path.resolve(__dirname, "../src/pages"), base: "pages" }
]

function walk(dir) {
  let out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out = out.concat(walk(full))
    else if (entry.name.endsWith(".js")) out.push(full)
  }
  return out
}

if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
fs.mkdirSync(tmpDir, { recursive: true })

let count = 0
for (const root of roots) {
  for (const file of walk(root.dir)) {
    let content = fs.readFileSync(file, "utf8")
    content = content.replace(/\.js"/g, '.mjs"')
    const rel = path.join(root.base, path.relative(root.dir, file)).replace(/\.js$/, ".mjs")
    const out = path.join(tmpDir, rel)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, content, "utf8")
    count++
  }
}
console.log(`[convert] ${count} files -> ${tmpDir}`)
