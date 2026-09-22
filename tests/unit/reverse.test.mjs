import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildLiterals,
  buildPathLiterals,
  encodeRelPath,
  encodeSegment,
  inferCmakeMeta,
  parameterizeText,
  scanProject,
  suggestTemplateId,
} from '../../src/template/reverse.mjs';

function sandbox(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctpl-rev-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  return dir;
}

test('inferCmakeMeta 抠出 project / minVersion / CXX_STANDARD', () => {
  const meta = inferCmakeMeta(`
    cmake_minimum_required(VERSION 3.20)
    project(MyRender VERSION 0.1.0 LANGUAGES CXX)
    set(CMAKE_CXX_STANDARD 17)
  `);
  assert.equal(meta.projectName, 'MyRender');
  assert.equal(meta.minVersion, '3.20');
  assert.equal(meta.cxxStandard, '17');
  assert.equal(inferCmakeMeta('project()').projectName, null);
});

test('scanProject 套用默认排除表，--include 可以反悔', () => {
  const dir = sandbox({
    'CMakeLists.txt': 'project(x)',
    'src/main.cpp': 'int main(){}',
    '.gitignore': 'build/',
    'build/CMakeCache.txt': 'x',
    'build/out.o': 'x',
    'cmake-build-debug/x.o': 'x',
    'compile_commands.json': '[]',
    'CMakePresets.json': '{}',
    '.vscode/settings.json': '{}',
    'node_modules/foo/index.js': 'x',
    'src/keep.obj': 'x',
  });

  const scan = scanProject(dir);
  const files = scan.files.map((f) => f.rel).sort();
  assert.deepEqual(files, ['CMakeLists.txt', '.gitignore', 'src/main.cpp'].sort());

  assert.ok(scan.excludedDirs.includes('build'));
  assert.ok(scan.excludedDirs.includes('node_modules'));
  assert.ok(scan.excludedDirs.includes('.vscode'));

  const withVscode = scanProject(dir, { include: ['.vscode/**'] });
  assert.ok(withVscode.files.map((f) => f.rel).includes('.vscode/settings.json'));

  const withBuild = scanProject(dir, { exclude: ['src/**'] });
  assert.ok(!withBuild.files.map((f) => f.rel).includes('src/main.cpp'));
});

test('parameterizeText 的边界处理', () => {
  const literals = buildLiterals('MyRender');
  const src = [
    'project(MyRender)',
    'add_library(my_render_core STATIC x.cpp)',
    '#define MY_RENDER_VERSION "0.1.0"',
    '/* MyRender2D 不能被命中 */',
    '// myrender 小写形式',
  ].join('\n');
  const { text, count } = parameterizeText(src, literals);

  assert.match(text, /project\(\{\{projectName\}\}\)/);
  assert.match(text, /add_library\(\{\{projectNameSnake\}\}_core/);
  assert.match(text, /#define \{\{projectNameUpper\}\}_VERSION/);
  assert.match(text, /\/\* MyRender2D 不能被命中 \*\//);
  assert.match(text, /\/\/ \{\{projectNameLower\}\} 小写形式/);
  assert.equal(count, 4);
});

test('项目名本身永远走 {{projectName}}，不擅自转成 snake', () => {
  const literals = buildLiterals('my_render');
  assert.equal(
    parameterizeText('project(my_render LANGUAGES CXX)', literals).text,
    'project({{projectName}} LANGUAGES CXX)',
  );
  assert.equal(
    parameterizeText('add_executable(my_render src/main.cpp)', literals).text,
    'add_executable({{projectName}} src/main.cpp)',
  );
  assert.equal(
    parameterizeText('add_library(my_render_core STATIC x.cpp)', literals).text,
    'add_library({{projectName}}_core STATIC x.cpp)',
  );

  // 只有“另外写了一种风格”的字面量才走派生占位符
  const mixed = buildLiterals('MyRender');
  assert.equal(
    parameterizeText('include "my_render/app.hpp"', mixed).text,
    'include "{{projectNameSnake}}/app.hpp"',
  );
});

test('路径与文本用同一套映射，项目名部分大小写保持一致', () => {
  assert.equal(
    encodeRelPath('include/my_render/app.hpp', buildPathLiterals('my_render')),
    'include/{{projectName}}/app.hpp',
  );
});

test('路径编码：点文件变成下划线，并替换风格化占位符', () => {
  assert.equal(encodeSegment('.gitignore'), '_gitignore');
  assert.equal(encodeSegment('.vscode'), '_vscode');
  assert.equal(encodeSegment('normal.txt'), 'normal.txt');

  const pathLiterals = buildPathLiterals('MyRender');
  assert.equal(
    encodeRelPath('include/my_render/app.hpp', pathLiterals),
    'include/{{projectNameSnake}}/app.hpp',
  );
  assert.equal(
    encodeRelPath('.github/workflows/ci.yml', pathLiterals),
    '_github/workflows/ci.yml',
  );
});

test('suggestTemplateId 产出合法 id', () => {
  assert.match(suggestTemplateId('MyRender'), /^[a-z0-9][a-z0-9._-]*$/);
  assert.equal(suggestTemplateId('My Render'), 'my-render');
  assert.equal(suggestTemplateId(''), 'project');
  assert.equal(suggestTemplateId('!!!'), 'project');
});
