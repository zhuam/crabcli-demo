package com.crabcli.library.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.crabcli.library.domain.Book;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BookRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * BE-B07 验收（Issue #122）：可借副本口径逐条自证。
 * <ul>
 *   <li>口径 = totalCopies − 占用借阅（存储 BORROWED 即含派生 OVERDUE、未赔 LOST）
 *       − HELD 预约；RETURNED / LOST_PAID / 非 HELD 预约不占（验收 1）；</li>
 *   <li>WITHDRAWN 恒 0；HELD 保留副本不放回可借池（契约定稿项）；</li>
 *   <li>书目行（BookRepository 内联同一口径片段）与单书查询严格同值——口径唯一来源；</li>
 *   <li>书不存在 404 BOOK_NOT_FOUND。</li>
 * </ul>
 * 与其他 IT 共用同一测试库与 Spring 上下文：bookCode 带 nanoTime 后缀自建自清，
 * 种子 R0001 只读 id 不改动。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
class AvailableCopiesServiceTest {

    @Autowired
    AvailableCopiesService service;
    @Autowired
    BookRepository bookRepository;
    @Autowired
    JdbcTemplate jdbc;

    private int bookId;

    @BeforeEach
    void createBook() {
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        String code = "B07-" + System.nanoTime();
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, 3)",
                code, "口径验收书-" + code, "测试作者", categoryId);
        bookId = jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
        jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
        jdbc.update("DELETE FROM books WHERE id = ?", bookId);
    }

    @Test
    void freshBookIsFullyAvailableAndListRowAgrees() {
        assertBothPaths(3);
    }

    @Test
    void borrowedAndUnpaidLostDeductReturnedAndPaidDoNot() {
        insertBorrow("BORROWED", "2026-10-12", null);
        insertBorrow("RETURNED", "2026-09-01", "2026-09-10T00:00:00.000Z");
        assertBothPaths(2); // 已还不占
        insertBorrow("LOST", "2026-08-01", null);
        assertBothPaths(1); // 未赔 LOST 占
        insertBorrow("LOST_PAID", "2026-07-01", null);
        assertBothPaths(1); // 已赔不占
    }

    @Test
    void overdueDerivedFromBorrowedStillDeductsOnce() {
        // due 已过且未归还 = 契约 OVERDUE（读时派生，行仍存 BORROWED）：同占 1 份不重复扣
        insertBorrow("BORROWED", "2026-09-01", null);
        assertBothPaths(2);
    }

    @Test
    void heldReservationDeductsOtherStatesDoNot() {
        insertReservation("WAITING");
        insertReservation("EXPIRED");
        insertReservation("FULFILLED");
        insertReservation("CANCELLED");
        assertBothPaths(3); // 非 HELD 均不占
        insertReservation("HELD");
        assertBothPaths(2); // HELD 保留副本不放回可借池
    }

    @Test
    void combinedDeductionsReachZero() {
        insertBorrow("BORROWED", "2026-10-12", null);
        insertBorrow("LOST", "2026-08-01", null);
        insertReservation("HELD");
        assertBothPaths(0);
    }

    @Test
    void withdrawnBookIsZeroEvenWithLoansOutstanding() {
        insertBorrow("BORROWED", "2026-10-12", null);
        jdbc.update("UPDATE books SET status = 'WITHDRAWN' WHERE id = ?", bookId);
        assertThat(service.availableCopies(bookId)).isZero();
        assertThat(bookRepository.findById(bookId).orElseThrow().availableCopies()).isZero();
    }

    @Test
    void missingBookIs404BookNotFound() {
        assertThatThrownBy(() -> service.availableCopies(999999))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.code()).isEqualTo("BOOK_NOT_FOUND");
                    assertThat(e.httpStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                });
    }

    /** 单书查询与书目行（BookRepository SELECT 内联同一口径片段）必须同值。 */
    private void assertBothPaths(int expected) {
        assertThat(service.availableCopies(bookId)).isEqualTo(expected);
        Book row = bookRepository.findById(bookId).orElseThrow();
        assertThat(row.availableCopies()).isEqualTo(expected);
    }

    private void insertBorrow(String status, String dueDate, String returnedAt) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, "
                        + "returned_at, status) VALUES (?, ?, '2026-09-01T00:00:00.000Z', ?, ?, ?)",
                seedReaderId(), bookId, dueDate + "T00:00:00.000Z", returnedAt, status);
    }

    private void insertReservation(String status) {
        jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                        + "VALUES (?, ?, ?, ?)",
                seedReaderId(), bookId, status,
                "HELD".equals(status) ? "2026-09-24T00:00:00.000Z" : null);
    }

    private int seedReaderId() {
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = 'R0001'", Integer.class);
    }
}
