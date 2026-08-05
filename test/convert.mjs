// test/convert.mjs
/**
 * 将 src/common 的 .js 模块转换为 .mjs 副本到 test/.cache/esm/
 * 原因: 项目 package.json 无 "type": "module", node 会把 .js 当 CJS,
 *       而项目模块是 ESM 语法——测试只能从转换后的 .mjs 副本导入。
 * 副本目录已被 .gitignore 忽略, 运行 npm test 时自动重建。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(__dirname, "../src/common")
const tmpDir = path.resolve(__dirname, ".cache/esm")

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
for (const file of walk(srcDir)) {
  let content = fs.readFileSync(file, "utf8")
  content = content.replace(/\.js"/g, '.mjs"')
  const rel = path.relative(srcDir, file).replace(/\.js$/, ".mjs")
  const out = path.join(tmpDir, rel)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, content, "utf8")
  count++
}
console.log(`[convert] ${count} files -> ${tmpDir}`)
