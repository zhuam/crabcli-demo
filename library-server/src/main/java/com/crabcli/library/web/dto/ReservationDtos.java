package com.crabcli.library.web.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 预约契约 DTO（BE-B09 / Issue #124）。错误响应复用 BE-B02 统一错误体
 * （平铺 {@code {"code","message"}}，中文直显）。
 */
public final class ReservationDtos {

    private ReservationDtos() {
    }

    /** 预约请求：readerId / bookId 均必填且为正数（缺失或非法在控制器边界 400）。 */
    public record ReservationRequest(
            @NotNull(message = "读者不能为空") @Positive(message = "读者 ID 非法") Integer readerId,
            @NotNull(message = "书籍不能为空") @Positive(message = "书籍 ID 非法") Integer bookId) {
    }

    /**
     * 预约视图：queuePosition 仅 WAITING 有值（1 起，创建序即队列序），其余状态为
     * null；holdExpiresAt 仅 HELD 有值。两个派生字段由服务层按契约计算，前端直接
     * 消费不自行推算（契约「前端永远拿到结算后状态」）。
     */
    public record ReservationView(int id, int readerId, int bookId, String status,
                                  String holdExpiresAt, Integer queuePosition,
                                  String createdAt, String updatedAt) {
    }
}
