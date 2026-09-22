package com.crabcli.library.service;

import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.domain.BorrowStatus;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BorrowRepository;
import java.math.BigDecimal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * 丢失赔偿业务（BE-B13 / Issue #128，F9：仅登记与结算，不对接支付）：登记丢失 →
 * 结算赔偿的两步闭环。
 * <p>登记链（{@link #markLost}）：<ol>
 *   <li>记录存在 → 404 {@code BORROW_NOT_FOUND}；</li>
 *   <li>存储态 BORROWED → 409 {@code BORROW_NOT_ACTIVE}（RETURNED / LOST / LOST_PAID
 *       均为已结束借阅，#125/#126/#128 共用同码）。</li>
 * </ol>过链后 status=LOST、compensationStatus=PENDING、金额落 compensation_amount。
 * 金额合法性（必填 / 正数 / 数字）在控制器边界校验（{@code LostRequest} 校验注解 +
 * JSON 反序列化），不在此重复。
 * <p>结算链（{@link #compensate}）：<ol>
 *   <li>记录存在 → 404 {@code BORROW_NOT_FOUND}；</li>
 *   <li>已赔 → 409 {@code COMPENSATION_ALREADY_PAID}（先于状态判定——LOST_PAID 行
 *       状态已非 LOST，若先判状态会把重复结算误报成 BORROW_NOT_ACTIVE，契约指定
 *       已赔重复结算落本码）；</li>
 *   <li>存储态 LOST → 409 {@code BORROW_NOT_ACTIVE}（BORROWED 未丢失、RETURNED 已还，
 *       均无赔偿可结算）。</li>
 * </ol>过链后 status=LOST_PAID、compensationStatus=PAID，流程闭环。
 * <p>写路径为守卫式 UPDATE（见 {@link BorrowRepository#markLost} /
 * {@link BorrowRepository#markCompensated}）：校验与写之间的并发窗口内状态被并发改变时
 * 0 行命中，重载最新行重走校验链一次（#126 同款有界重试，SQLite 单写者下必收敛）。
 * <p>配额与可借副本无需手调：LOST 未赔仍计占用（[假设 A8]，字面唯一来源
 * {@code BorrowRepository#ACTIVE_STATUS_PREDICATE}），LOST_PAID 不占——读时实时派生，
 * 本类不触碰副本口径。
 */
@Service
public class LostCompensationService {

    private final BorrowRepository borrowRepository;

    public LostCompensationService(BorrowRepository borrowRepository) {
        this.borrowRepository = borrowRepository;
    }

    /** 登记丢失：校验链全过 → status=LOST、compensationStatus=PENDING、金额已记录。 */
    public BorrowRecord markLost(int borrowRecordId, BigDecimal compensationAmount) {
        BorrowRecord record = borrowRepository.findById(borrowRecordId)
                .orElseThrow(() -> new ApiException("BORROW_NOT_FOUND", "借阅记录不存在",
                        HttpStatus.NOT_FOUND));
        requireBorrowed(record);
        if (borrowRepository.markLost(borrowRecordId, compensationAmount) == 0) {
            // 并发窗口内状态已变：以最新行重判（有界一次，SQLite 单写者下必收敛）
            return markLost(borrowRecordId, compensationAmount);
        }
        return borrowRepository.findById(borrowRecordId).orElseThrow();
    }

    /** 赔偿结算：校验链全过 → status=LOST_PAID、compensationStatus=PAID，闭环。 */
    public BorrowRecord compensate(int borrowRecordId) {
        BorrowRecord record = borrowRepository.findById(borrowRecordId)
                .orElseThrow(() -> new ApiException("BORROW_NOT_FOUND", "借阅记录不存在",
                        HttpStatus.NOT_FOUND));
        if ("PAID".equals(record.compensationStatus())) {
            throw new ApiException("COMPENSATION_ALREADY_PAID", "赔偿已登记完成，不能重复赔偿",
                    HttpStatus.CONFLICT);
        }
        if (!BorrowStatus.LOST.name().equals(record.status())) {
            throw new ApiException("BORROW_NOT_ACTIVE", "该借阅记录未处于丢失待赔状态，不能赔偿",
                    HttpStatus.CONFLICT);
        }
        if (borrowRepository.markCompensated(borrowRecordId) == 0) {
            return compensate(borrowRecordId);
        }
        return borrowRepository.findById(borrowRecordId).orElseThrow();
    }

    private void requireBorrowed(BorrowRecord record) {
        if (!BorrowStatus.BORROWED.name().equals(record.status())) {
            throw new ApiException("BORROW_NOT_ACTIVE", "该借阅记录已结束，不能登记丢失",
                    HttpStatus.CONFLICT);
        }
    }
}
