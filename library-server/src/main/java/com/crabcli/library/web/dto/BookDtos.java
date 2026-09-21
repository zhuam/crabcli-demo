package com.crabcli.library.web.dto;

import com.crabcli.library.domain.Book;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.List;

/**
 * 书籍管理契约 DTO（BE-B06 / Issue #121）。口径沿用 #115 契约：
 * 列表分页 {@code {items,total,page,size}}（page 从 1 起，size 上限 100，上限校验在服务层）。
 */
public final class BookDtos {

    private BookDtos() {
    }

    /** 新增请求：keywords 可选（字符串数组原样往返，null 表示不填）；remark 可选。 */
    public record BookCreateRequest(
            @NotBlank(message = "书籍编号不能为空") String bookCode,
            @NotBlank(message = "书名不能为空") String title,
            @NotBlank(message = "作者不能为空") String author,
            @NotNull(message = "类别不能为空") @Positive(message = "类别 ID 非法") Integer categoryId,
            List<String> keywords,
            @NotNull(message = "馆藏数量不能为空") @Min(value = 1, message = "馆藏数量至少为 1") Integer totalCopies,
            String remark) {
    }

    /**
     * 修改请求：全部可选，null = 保持原值（与 reader-types 部分更新同口径；
     * 不支持把 remark 清空，传非 null 即更新）。字段级约束只用 null 跳过的
     * {@code @Positive}/{@code @Min}——{@code @NotBlank} 对 null 也违规，会逼 PUT
     * 必带全字段，破坏部分更新语义；「提供了就不能是空白」由服务层校验。
     */
    public record BookUpdateRequest(
            String title,
            String author,
            @Positive(message = "类别 ID 非法") Integer categoryId,
            List<String> keywords,
            @Min(value = 1, message = "馆藏数量至少为 1") Integer totalCopies,
            String remark) {
    }

    /** 分页列表响应：契约 {items,total,page,size}。 */
    public record BookPage(List<Book> items, long total, int page, int size) {
    }
}
