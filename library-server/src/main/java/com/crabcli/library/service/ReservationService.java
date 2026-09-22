package com.crabcli.library.service;

import com.crabcli.library.auth.LoginUser;
import com.crabcli.library.auth.Role;
import com.crabcli.library.domain.Book;
import com.crabcli.library.domain.Reader;
import com.crabcli.library.domain.Reservation;
import com.crabcli.library.domain.ReservationStatus;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BookRepository;
import com.crabcli.library.repo.BorrowRepository;
import com.crabcli.library.repo.ReaderRepository;
import com.crabcli.library.repo.ReservationRepository;
import com.crabcli.library.web.dto.ReservationDtos.ReservationRequest;
import com.crabcli.library.web.dto.ReservationDtos.ReservationView;
import java.util.List;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * 预约业务（BE-B09 / Issue #124）：仅当馆藏全部副本借出（availableCopies = 0，
 * AvailableCopiesService 口径，HELD 保留副本不计入可借）时允许排队预约。
 * <p>入口先执行 {@link ReservationExpirySweeper#sweepExpiredHolds()} 惰性结算
 * （[假设 B6]）再读写，前端永远拿到结算后状态。
 * <p>建预约校验链（本实现定稿顺序，镜像借书链「读者状态 → 读者-书关系 → 书副本」）：
 * <ol>
 *   <li>读者存在 → 404 {@code READER_NOT_FOUND}；</li>
 *   <li>书存在 → 404 {@code BOOK_NOT_FOUND}；</li>
 *   <li>未注销 → 409 {@code READER_INACTIVE}；</li>
 *   <li>未借阅该书 → 409 {@code ALREADY_BORROWED}；</li>
 *   <li>无仍生效预约 → 409 {@code DUPLICATE_RESERVATION}；</li>
 *   <li>无剩余可借副本 → 409 {@code RESERVATION_NOT_ALLOWED}。</li>
 * </ol>
 * <p>取消：WAITING / HELD → CANCELLED；HELD 取消释放副本并递补下一位 WAITING；
 * 终态（CANCELLED / EXPIRED / FULFILLED）→ 409 {@code RESERVATION_NOT_ACTIVE}。
 * READER 仅可取消本人预约（契约定稿第 10 项），他人预约 403 {@code FORBIDDEN}；
 * 馆员 / 管理员可取消任意预约。
 */
@Service
public class ReservationService {

    private final ReaderRepository readerRepository;
    private final BookRepository bookRepository;
    private final BorrowRepository borrowRepository;
    private final ReservationRepository reservationRepository;
    private final ReservationExpirySweeper sweeper;

    public ReservationService(ReaderRepository readerRepository, BookRepository bookRepository,
                              BorrowRepository borrowRepository,
                              ReservationRepository reservationRepository,
                              ReservationExpirySweeper sweeper) {
        this.readerRepository = readerRepository;
        this.bookRepository = bookRepository;
        this.borrowRepository = borrowRepository;
        this.reservationRepository = reservationRepository;
        this.sweeper = sweeper;
    }

    /** 建预约：校验链全过 → 落 WAITING 行，返回含 queuePosition 的结算后视图。 */
    public ReservationView create(ReservationRequest request) {
        sweeper.sweepExpiredHolds();

        Reader reader = readerRepository.findById(request.readerId())
                .orElseThrow(() -> new ApiException("READER_NOT_FOUND", "读者不存在",
                        HttpStatus.NOT_FOUND));
        Book book = bookRepository.findById(request.bookId())
                .orElseThrow(() -> new ApiException("BOOK_NOT_FOUND", "书籍不存在",
                        HttpStatus.NOT_FOUND));
        if (!"ACTIVE".equals(reader.status())) {
            throw new ApiException("READER_INACTIVE", "读者已注销，不能预约", HttpStatus.CONFLICT);
        }
        if (borrowRepository.existsActiveByReaderAndBook(reader.id(), book.id())) {
            throw new ApiException("ALREADY_BORROWED", "读者已借阅该书，无需预约",
                    HttpStatus.CONFLICT);
        }
        if (reservationRepository.existsActiveByReaderAndBook(reader.id(), book.id())) {
            throw new ApiException("DUPLICATE_RESERVATION", "读者已预约该书，请勿重复预约",
                    HttpStatus.CONFLICT);
        }
        if (book.availableCopies() > 0) {
            throw new ApiException("RESERVATION_NOT_ALLOWED",
                    "该书仍有 %d 本可借，无需预约".formatted(book.availableCopies()),
                    HttpStatus.CONFLICT);
        }

        int id = reservationRepository.insert(reader.id(), book.id());
        return toView(reservationRepository.findById(id).orElseThrow());
    }

    /** 取消预约：结算先行 → 归属校验 → 状态流转 → HELD 释放副本并递补。 */
    public ReservationView cancel(int reservationId, LoginUser actor) {
        sweeper.sweepExpiredHolds();

        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ApiException("RESERVATION_NOT_FOUND", "预约不存在",
                        HttpStatus.NOT_FOUND));

        if (actor.role() == Role.READER
                && !Objects.equals(reservation.readerId(), actor.readerId())) {
            throw new ApiException("FORBIDDEN", "只能取消本人预约", HttpStatus.FORBIDDEN);
        }
        boolean held = ReservationStatus.HELD.name().equals(reservation.status());
        boolean active = held || ReservationStatus.WAITING.name().equals(reservation.status());
        if (!active) {
            throw new ApiException("RESERVATION_NOT_ACTIVE", "预约已失效，不能取消",
                    HttpStatus.CONFLICT);
        }

        reservationRepository.updateStatus(reservationId, "CANCELLED", null);
        if (held) {
            sweeper.promoteNextWaiting(reservation.bookId());
        }
        return toView(reservationRepository.findById(reservationId).orElseThrow());
    }

    /** 预约列表（可按 readerId / bookId / status 过滤，均可选）：入口先惰性结算。 */
    public List<ReservationView> list(Integer readerId, Integer bookId, String status) {
        sweeper.sweepExpiredHolds();
        return reservationRepository.findByFilter(readerId, bookId, status).stream()
                .map(this::toView)
                .toList();
    }

    /**
     * WAITING 行补 queuePosition（含自身的队列序，1 起），其余状态为 null。
     * 逐行点查与列表行同一处表达排位语义，馆员台列表规模下开销可忽略。
     */
    private ReservationView toView(Reservation reservation) {
        Integer queuePosition = "WAITING".equals(reservation.status())
                ? reservationRepository.countWaitingUpTo(reservation.bookId(), reservation.id())
                : null;
        return new ReservationView(reservation.id(), reservation.readerId(),
                reservation.bookId(), reservation.status(), reservation.holdExpiresAt(),
                queuePosition, reservation.createdAt(), reservation.updatedAt());
    }
}
