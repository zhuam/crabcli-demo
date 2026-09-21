package com.crabcli.library.domain;

/**
 * 读者类型（F1/F11 / Issue #119）：借阅配额与借期的参数化载体。
 * <p>业务代码（借书、续借等）不得硬编码配额，一律经
 * {@code ReaderTypeRepository} 实时读取——PUT 更新后下一次业务读数即为新值，
 * 无需重启（F11 验收：NORMAL 3→5 后第 4 本可借、第 6 本被拒）。
 */
public record ReaderType(String code, String name, int maxBorrow, int loanWeeks) {
}
