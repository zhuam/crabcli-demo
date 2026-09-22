package com.crabcli.library.web.dto;

import java.util.List;

/**
 * 借阅查询契约 DTO（BE-B12 / Issue #127）：F7 借阅记录多条件查询 + F8 逾期天数。
 * 时间出参收敛为日期部分（borrowDate / dueDate / returnedAt，borrowed_at 等原始
 * 时刻列仅在借出端点返回）；status 为契约生效态（OVERDUE 读时派生，见
 * {@code BorrowStatus}），overdueDays 仅 OVERDUE 行非 0。分页形状沿用既有
 * {@code {items,total,page,size}}（BookPage / ReaderPage 同款）。
 */
public final class BorrowQueryDtos {

    private BorrowQueryDtos() {
    }

    /** 借阅查询行：契约键序，日期均为 ISO 前 10 字符。 */
    public record BorrowQueryView(int id, int readerId, int bookId, String borrowDate,
                                  String dueDate, String returnedAt, int renewCount,
                                  String status, String compensationStatus,
                                  long overdueDays) {
    }

    /** 分页响应：total 为过滤后总数（SQL COUNT 同一 WHERE）。 */
    public record BorrowQueryPage(List<BorrowQueryView> items, long total, int page, int size) {
    }
}
