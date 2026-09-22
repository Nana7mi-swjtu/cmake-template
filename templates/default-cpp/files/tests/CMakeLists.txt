# 这是一个"程序能构建并跑起来"的最小冒烟测试。
# 有真正的逻辑之后，换成像样的单元测试框架（Catch2 / GoogleTest / doctest）。
add_test(NAME smoke COMMAND {{targetName}})
