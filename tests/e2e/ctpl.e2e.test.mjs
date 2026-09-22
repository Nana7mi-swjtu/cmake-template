import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EXPECTED_DEFAULT_FILES,
  cmakeConfigureAndBuild,
  ctpl,
  listDirs,
  listFiles,
  runCommand,
  runExe,
  sandbox,
  skipWithoutToolchain,
} from './helpers.mjs';

test('R2：全新环境 --yes 生成默认工程并构建、运行', { skip: skipWithoutToolchain }, () => {
  const box = sandbox('new');
  try {
    const res = ctpl(['new', box.p('MyApp'), '--yes', '--no-git', '--no-open'], { box });
    assert.equal(res.status, 0, res.all);

    assert.deepEqual(listFiles(box.p('MyApp')).sort(), [...EXPECTED_DEFAULT_FILES].sort());

    // C1/C2/C3/C4：无 presets、无硬编码工具链路径、.gitignore 忽略 build
    const all = listFiles(box.p('MyApp'));
    assert.ok(!all.some((f) => /CMakePresets\.json|CMakeUserPresets\.json/.test(f)));
    assert.ok(!all.some((f) => f.startsWith('.vscode/')));
    // 目录也要在（inc/ 里只有 .gitkeep）
    assert.deepEqual(listDirs(box.p('MyApp')).sort(), ['inc', 'src']);
    const cmakeLists = fs.readFileSync(box.p('MyApp', 'CMakeLists.txt'), 'utf8');
    assert.match(cmakeLists, /CMAKE_CXX_STANDARD 11/);
    // C2：模板里不能出现任何硬编码的工具链绝对路径
    assert.doesNotMatch(cmakeLists, /[A-Za-z]:[\\/]/);
    assert.doesNotMatch(cmakeLists, /CMAKE_PREFIX_PATH|CMAKE_MAKE_PROGRAM/);
    assert.doesNotMatch(cmakeLists, /CMAKE_EXPORT_COMPILE_COMMANDS/);
    // 单文件工程 + inc/：没有库，但有头文件搜索路径
    assert.match(cmakeLists, /add_executable\(MyApp src\/main\.cpp\)/);
    assert.doesNotMatch(cmakeLists, /add_library/);
    assert.match(cmakeLists, /target_include_directories\(MyApp PRIVATE \$\{CMAKE_CURRENT_SOURCE_DIR\}\/inc\)/);
    assert.match(cmakeLists, /MY_APP_VERSION="\$\{PROJECT_VERSION\}"/);
    assert.match(fs.readFileSync(box.p('MyApp', '.gitignore'), 'utf8'), /build\//);

    const built = cmakeConfigureAndBuild(box.p('MyApp'));
    assert.ok(built.ok, `${built.step} 失败：\n${built.output}`);

    const run = runExe(box.p('MyApp'), 'MyApp', ['hello']);
    assert.equal(run.status, 0, run.out);
    assert.match(run.out, /MyApp 0\.1\.0/);
    assert.match(run.out, /argv\[1\] = hello/);
  } finally {
    box.cleanup();
  }
});

test('R3：--with tests 生成可选组并让 ctest 通过', { skip: skipWithoutToolchain }, () => {
  const box = sandbox('tests');
  try {
    const res = ctpl(['new', box.p('MyApp'), '--yes', '--no-git', '--no-open', '--with', 'tests'], {
      box,
    });
    assert.equal(res.status, 0, res.all);
    const all = listFiles(box.p('MyApp'));
    assert.ok(all.includes('tests/CMakeLists.txt'));
    assert.ok(!all.includes('tests/test_smoke.cpp'));

    const built = cmakeConfigureAndBuild(box.p('MyApp'));
    assert.ok(built.ok, `${built.step} 失败：\n${built.output}`);

    const ctest = runCommand('ctest', ['--test-dir', 'build', '--output-on-failure'], {
      cwd: box.p('MyApp'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(ctest.status, 0, `${ctest.stdout || ''}${ctest.stderr || ''}`);
  } finally {
    box.cleanup();
  }
});

test('R1：init 反向生成模板 → 用该模板再生成工程 → 构建运行', { skip: skipWithoutToolchain }, () => {
  const box = sandbox('roundtrip');
  try {
    // 1) 先造一个"现有工程"
    const src = ctpl(['new', box.p('SrcProj'), '--yes', '--no-git', '--no-open'], { box });
    assert.equal(src.status, 0, src.all);
    const srcFiles = listFiles(box.p('SrcProj'));
    assert.ok(srcFiles.includes('src/main.cpp'));

    // 2) 反向生成模板
    const init = ctpl(
      ['init', box.p('SrcProj'), '--id', 'round-trip', '--name', '往返测试', '--yes'],
      { box },
    );
    assert.equal(init.status, 0, init.all);

    const tplRoot = path.join(box.templatesDir, 'round-trip');
    const tplFiles = listFiles(path.join(tplRoot, 'files'));
    // init 会把点文件编码成 _x（.gitignore → _gitignore，.gitkeep → _gitkeep），
    // 而 _gitkeep 在 new 时又还原成“保留这个空目录”
    assert.deepEqual(tplFiles.sort(), [
      'CMakeLists.txt',
      'README.md',
      '_gitignore',
      'inc/_gitkeep',
      'src/main.cpp',
    ]);
    const cmakeTpl = fs.readFileSync(path.join(tplRoot, 'files', 'CMakeLists.txt'), 'utf8');
    assert.match(cmakeTpl, /project\(\{\{projectName\}\}/);
    // target 名默认等于项目名，不破 C++ 不改写
    assert.match(cmakeTpl, /add_executable\(\{\{projectName\}\} src\/main\.cpp\)/);
    assert.match(cmakeTpl, /\{\{projectNameUpper\}\}_VERSION="\$\{PROJECT_VERSION\}"/);
    assert.doesNotMatch(cmakeTpl, /SrcProj/);
    assert.doesNotMatch(cmakeTpl, /src_proj/);

    // 3) 用这个模板生成另一个名字的工程
    const use = ctpl(
      ['new', box.p('OtherName'), '-t', 'round-trip', '--yes', '--no-git', '--no-open'],
      { box },
    );
    assert.equal(use.status, 0, use.all);

    const expected = srcFiles.map((f) => f.split('src_proj').join('other_name'));
    assert.deepEqual(listFiles(box.p('OtherName')).sort(), expected.sort());

    const otherCmake = fs.readFileSync(box.p('OtherName', 'CMakeLists.txt'), 'utf8');
    assert.match(otherCmake, /project\(OtherName/);
    assert.match(otherCmake, /add_executable\(OtherName /);
    assert.doesNotMatch(otherCmake, /SrcProj/);

    // 4) 新工程能构建运行
    const built = cmakeConfigureAndBuild(box.p('OtherName'));
    assert.ok(built.ok, `${built.step} 失败：\n${built.output}`);
    const run = runExe(box.p('OtherName'), 'OtherName');
    assert.equal(run.status, 0, run.out);
    assert.match(run.out, /OtherName 0\.1\.0/);
  } finally {
    box.cleanup();
  }
});

test('R2：删掉内置模板会自动恢复；restore 会先备份，备份不被当成模板', () => {
  const box = sandbox('restore');
  try {
    const tplDir = path.join(box.templatesDir, 'default-cpp');
    // 第一次跑命令时才会把内置模板落盘
    assert.equal(ctpl(['list'], { box }).status, 0);
    assert.ok(fs.existsSync(path.join(tplDir, 'template.json')), '首次解析应落地内置模板');

    fs.rmSync(tplDir, { recursive: true, force: true });
    const list = ctpl(['list'], { box });
    assert.equal(list.status, 0, list.all);
    assert.match(list.all, /已恢复内置模板 default-cpp/);
    assert.ok(fs.existsSync(path.join(tplDir, 'template.json')));

    fs.appendFileSync(path.join(tplDir, 'files', 'CMakeLists.txt'), '\n# 用户改动\n');
    const changed = ctpl(['list'], { box });
    assert.doesNotMatch(changed.all, /已恢复内置模板/); // 用户改过的不能被覆盖

    const restore = ctpl(['restore', 'default-cpp', '--yes'], { box });
    assert.equal(restore.status, 0, restore.all);
    const backups = fs.readdirSync(box.templatesDir).filter((n) => n.startsWith('default-cpp.bak-'));
    assert.equal(backups.length, 1);

    const list2 = ctpl(['list', '--json'], { box });
    const parsed = JSON.parse(list2.stdout);
    assert.equal(parsed.templates.filter((t) => t.id === 'default-cpp').length, 1);
  } finally {
    box.cleanup();
  }
});

test('非空目录：默认不往里塞文件，改成在它下面新建一层 <项目名>/', () => {
  const box = sandbox('nonempty');
  try {
    const parent = box.p('Busy');
    fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(path.join(parent, 'mine.txt'), 'keep me\n', 'utf8');
    fs.writeFileSync(path.join(parent, 'CMakeLists.txt'), '# my own\n', 'utf8');
    const before = listFiles(parent).sort();

    // --name 决定那层新目录叫什么；非交互下走默认分支
    const res = ctpl(
      ['new', parent, '--yes', '--no-git', '--no-open', '--name', 'Fresh', '--template-dir', box.templatesDir],
      { box },
    );
    assert.equal(res.status, 0, res.all);
    assert.match(res.all, /目标目录非空 → 改为在它下面新建 Fresh\//);

    // 原目录里的东西一个字节没动，只多了一个 Fresh/
    assert.deepEqual(listFiles(parent).filter((f) => !f.startsWith('Fresh/')).sort(), before);
    assert.equal(fs.readFileSync(path.join(parent, 'CMakeLists.txt'), 'utf8'), '# my own\n');
    const fresh = listFiles(path.join(parent, 'Fresh')).sort();
    assert.deepEqual(fresh, [...EXPECTED_DEFAULT_FILES].sort());
    assert.match(fs.readFileSync(path.join(parent, 'Fresh', 'CMakeLists.txt'), 'utf8'), /project\(Fresh/);

    // 不带 --name 时默认用目录名：Busy/Busy
    const bare = ctpl(['new', parent, '--yes', '--no-git', '--no-open'], { box });
    assert.equal(bare.status, 0, bare.all);
    assert.ok(fs.existsSync(path.join(parent, 'Busy', 'CMakeLists.txt')), '默认层名应为目录名');
  } finally {
    box.cleanup();
  }
});

test('冲突策略：--on-conflict=abort 拒绝，--force 覆盖并备份，=skip 保留用户文件', () => {
  const box = sandbox('conflict');
  try {
    const target = box.p('MyApp');
    assert.equal(ctpl(['new', target, '--yes', '--no-git', '--no-open'], { box }).status, 0);

    // 显式要求“不动就报错”
    const aborted = ctpl(
      ['new', target, '--yes', '--no-git', '--no-open', '--on-conflict=abort'],
      { box },
    );
    assert.equal(aborted.status, 4, aborted.all);
    assert.match(aborted.all, /已存在且非空/);

    // 显式覆盖 → 先备份
    const forced = ctpl(['new', target, '--yes', '--no-git', '--no-open', '--force'], { box });
    assert.equal(forced.status, 0, forced.all);
    assert.match(forced.all, /冲突 \d+ 处：/);
    assert.match(forced.all, /已备份/);
    const backups = fs.readdirSync(target).filter((n) => n.startsWith('CMakeLists.txt.bak-'));
    assert.equal(backups.length, 1, `应有一个 .bak 文件，实际：${fs.readdirSync(target).join(', ')}`);

    // 显式跳过 → 同名文件保留用户的
    fs.writeFileSync(path.join(target, 'CMakeLists.txt'), '# mine now\n', 'utf8');
    const skipped = ctpl(
      ['new', target, '--yes', '--no-git', '--no-open', '--on-conflict=skip'],
      { box },
    );
    assert.equal(skipped.status, 0, skipped.all);
    assert.match(skipped.all, /跳过已存在/);
    assert.equal(fs.readFileSync(path.join(target, 'CMakeLists.txt'), 'utf8'), '# mine now\n');
  } finally {
    box.cleanup();
  }
});

test('未配置模板根目录 + 非交互 + --yes → 退出码 2，绝不自动挑目录', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctpl-nodir-'));
  try {
    const res = ctpl(['new', path.join(dir, 'X'), '--yes'], {
      env: { CTPL_CONFIG_HOME: path.join(dir, 'cfg'), CTPL_TEMPLATE_DIR: '' },
    });
    assert.equal(res.status, 2, res.all);
    assert.match(res.all, /尚未配置模板根目录/);
    assert.ok(!fs.existsSync(path.join(dir, 'X')), '不应该创建任何东西');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('零 JSON：往模板目录里丢一个 files/ 就能用（裸模板）', () => {
  const box = sandbox('bare');
  try {
    // 用户只做了一件事：把文件拷进 templates/<id>/files/
    const files = path.join(box.templatesDir, 'drop-in', 'files');
    fs.mkdirSync(path.join(files, 'src', 'core'), { recursive: true });
    fs.mkdirSync(path.join(files, 'docs'), { recursive: true }); // 空目录
    fs.writeFileSync(path.join(files, 'hello.txt'), 'hello {{projectName}} ({{projectNameSnake}})\n', 'utf8');
    fs.writeFileSync(path.join(files, 'src', 'core', 'engine.cpp'), '// {{projectName}}\n', 'utf8');
    fs.writeFileSync(path.join(files, '_gitignore'), 'build/\n', 'utf8');

    const listed = ctpl(['list'], { box });
    assert.equal(listed.status, 0, listed.all);
    assert.match(listed.all, /drop-in/);
    assert.match(listed.all, /\[裸模板\]/);

    const shown = ctpl(['show', 'drop-in'], { box });
    assert.equal(shown.status, 0, shown.all);
    assert.match(shown.all, /无 template\.json/);
    assert.match(shown.all, /engine\.cpp/);

    const created = ctpl(['new', box.p('DropProj'), '-t', 'drop-in', '--yes', '--no-git', '--no-open'], {
      box,
    });
    assert.equal(created.status, 0, created.all);

    const out = listFiles(box.p('DropProj'));
    assert.ok(out.includes('hello.txt'), out.join(','));
    assert.ok(out.includes('src/core/engine.cpp'));
    assert.ok(out.includes('.gitignore')); // _gitignore → .gitignore 约定生效
    assert.ok(out.includes('docs/.gitkeep'), `空目录应该被保住：${out.join(',')}`);
    assert.equal(fs.readFileSync(box.p('DropProj', 'hello.txt'), 'utf8').trim(), 'hello DropProj (drop_proj)');
    assert.equal(fs.readFileSync(box.p('DropProj', 'src', 'core', 'engine.cpp'), 'utf8').trim(), '// DropProj');

    // 裸模板也能被 duplicate（副本会自动补一份 template.json）
    const dup = ctpl(['duplicate', 'drop-in', 'drop-in-2'], { box });
    assert.equal(dup.status, 0, dup.all);
    const copiedJson = JSON.parse(
      fs.readFileSync(path.join(box.templatesDir, 'drop-in-2', 'template.json'), 'utf8'),
    );
    assert.equal(copiedJson.id, 'drop-in-2');
    assert.equal(copiedJson.name, 'drop-in（副本）');
  } finally {
    box.cleanup();
  }
});

test('init 反向生成：嵌套目录（src/app/）原样保留', () => {
  const box = sandbox('nest');
  try {
    const src = path.join(box.dir, 'Nested');
    fs.mkdirSync(path.join(src, 'src', 'app'), { recursive: true });
    fs.mkdirSync(path.join(src, 'include', 'nested'), { recursive: true });
    fs.writeFileSync(
      path.join(src, 'CMakeLists.txt'),
      [
        'cmake_minimum_required(VERSION 3.20)',
        'project(Nested LANGUAGES CXX)',
        'add_library(nested_core STATIC src/app/app.cpp)',
        'target_include_directories(nested_core PUBLIC include)',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(src, 'src', 'app', 'app.cpp'), '// Nested / nested\n', 'utf8');
    fs.writeFileSync(path.join(src, 'include', 'nested', 'app.hpp'), '#pragma once\n', 'utf8');
    fs.mkdirSync(path.join(src, 'build'), { recursive: true }); // 应被排除
    fs.writeFileSync(path.join(src, 'build', 'junk.o'), 'x', 'utf8');

    const res = ctpl(['init', src, '--id', 'nested-tpl', '--yes'], { box });
    assert.equal(res.status, 0, res.all);

    const tplFiles = listFiles(path.join(box.templatesDir, 'nested-tpl', 'files'));
    assert.deepEqual(tplFiles.sort(), [
      'CMakeLists.txt',
      'include/{{projectNameSnake}}/app.hpp',
      'src/app/app.cpp',
    ]);
    assert.ok(!tplFiles.some((f) => f.startsWith('build/')), 'build/ 应被排除');

    // template.json 很短：只保留 id/name/描述/cmake
    const json = JSON.parse(
      fs.readFileSync(path.join(box.templatesDir, 'nested-tpl', 'template.json'), 'utf8'),
    );
    assert.deepEqual(Object.keys(json), ['schemaVersion', 'id', 'name', 'description', 'cmake']);
    assert.equal(json.layout, undefined); // 有文件的目录不用写 layout
    assert.equal(json.cmake.minVersion, '3.20');

    // 用这个模板生成时，src/app/ 这类嵌套目录应原样出现
    const created = ctpl(['new', box.p('Deep'), '-t', 'nested-tpl', '--yes', '--no-git', '--no-open'], {
      box,
    });
    assert.equal(created.status, 0, created.all);
    const out = listFiles(box.p('Deep'));
    assert.ok(out.includes('src/app/app.cpp'), out.join(','));
    assert.ok(out.includes('include/deep/app.hpp'), out.join(','));
    assert.match(fs.readFileSync(box.p('Deep', 'CMakeLists.txt'), 'utf8'), /add_library\(deep_core/);
  } finally {
    box.cleanup();
  }
});

test('import-cmake + duplicate + remove 的组合流程', () => {
  const box = sandbox('m1');
  try {
    const ref = box.p('ref-CMakeLists.txt');
    fs.writeFileSync(
      ref,
      [
        'cmake_minimum_required(VERSION 3.20)',
        'project(old_proj LANGUAGES CXX)',
        'add_library(old_proj_core STATIC src/x.cpp)',
      ].join('\n'),
      'utf8',
    );

    const imported = ctpl(
      ['import-cmake', ref, '--template', 'default-cpp', '--to', 'cmake/root.cmake', '--parameterize', '--yes'],
      { box },
    );
    assert.equal(imported.status, 0, imported.all);
    const content = fs.readFileSync(
      path.join(box.templatesDir, 'default-cpp', 'files', 'cmake', 'root.cmake'),
      'utf8',
    );
    assert.doesNotMatch(content, /old_proj/);
    // 项目名（snake 与否）永远走 {{projectName}}，不被私自改写
    assert.match(content, /project\(\{\{projectName\}\}/);
    assert.match(content, /\{\{projectName\}\}_core/);

    const dup = ctpl(['duplicate', 'default-cpp', 'mine', '--name', '中文模板名'], { box });
    assert.equal(dup.status, 0, dup.all);
    const mine = JSON.parse(
      fs.readFileSync(path.join(box.templatesDir, 'mine', 'template.json'), 'utf8'),
    );
    assert.equal(mine.id, 'mine');
    assert.equal(mine.name, '中文模板名');
    assert.equal(mine._builtin, undefined);

    const removed = ctpl(['remove', 'mine', '--yes'], { box });
    assert.equal(removed.status, 0, removed.all);
    assert.ok(!fs.existsSync(path.join(box.templatesDir, 'mine')));

    // 缺失的模板要报错退出码 2
    const missing = ctpl(['show', 'mine'], { box });
    assert.equal(missing.status, 2, missing.all);
  } finally {
    box.cleanup();
  }
});
