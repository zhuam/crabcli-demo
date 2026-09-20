// dict.js — 枚举到中文映射的全站唯一来源（Issue #131）。
// 约束：任一页面不得出现第二处枚举中文映射；页面一律通过 Dict 各组或 Dict.text() 取文案。
// 字面依据：BorrowStatus/ReservationStatus 见 Issue #122（契约字面）；
// role 三角色见 #115 F10；INACTIVE 见 #120；WITHDRAWN 见 #121；
// readerType 文案见 #136。bookStatus 非下架态字面无契约明文，取 ACTIVE（与 reader 的 ACTIVE/INACTIVE 对称，见 #120），
// 待 BE-B01 schema.sql（#116）落地后核对，若不一致只需改本文件一处。
(function () {
  'use strict';

  var groups = {
    role: { READER: '读者', LIBRARIAN: '馆员', ADMIN: '管理员' },
    readerType: { NORMAL: '普通读者', TEACHER: '教师·管理员类' },
    readerStatus: { ACTIVE: '正常', INACTIVE: '已注销' },
    bookStatus: { ACTIVE: '在架', WITHDRAWN: '已下架' },
    // 契约字面（#122）：BORROWED|OVERDUE|RETURNED|LOST|LOST_PAID
    borrowStatus: { BORROWED: '在借', OVERDUE: '逾期', RETURNED: '已还', LOST: '丢失', LOST_PAID: '已赔' },
    // #128：登记丢失 → PENDING，赔偿完成 → PAID
    compensationStatus: { PENDING: '待赔偿', PAID: '已赔偿' },
    // 契约字面（#122）：WAITING|HELD|EXPIRED|FULFILLED|CANCELLED
    reservationStatus: { WAITING: '排队中', HELD: '保留中', EXPIRED: '已失效', FULFILLED: '已借出', CANCELLED: '已取消' }
  };

  // 全部 409 拒绝码的中文兜底文案。后端 message 为准、中文直显（契约「不映射」），
  // 本表仅在响应缺 message 时兜底，也供页面写操作确认文案时复用。
  // 依据：#119（2 个）、#120（1）、#121（1）、#123（6）、#124（4）、#125/#126/#128（BORROW_NOT_ACTIVE）、
  // #126（3）、#128（1），去重共 19 个。
  var rejectReason = {
    DUPLICATE_CATEGORY: '类别名已存在',
    CATEGORY_IN_USE: '类别已被书籍引用，无法删除',
    DUPLICATE_CARD_NO: '读者证号已存在',
    DUPLICATE_BOOK_CODE: '图书编号已存在',
    QUOTA_EXCEEDED: '超出借阅配额',
    READER_HAS_OVERDUE: '读者有逾期未还图书，暂不能借书',
    READER_INACTIVE: '读者已注销',
    BOOK_WITHDRAWN: '图书已下架',
    NO_AVAILABLE_COPY: '该书无可借副本',
    RESERVED_FOR_OTHER_READER: '该书已被其他读者预约保留',
    RESERVATION_NOT_ALLOWED: '该书有可借副本，无需预约',
    DUPLICATE_RESERVATION: '已预约该书，请勿重复预约',
    ALREADY_BORROWED: '当前已借阅该书，无需预约',
    RESERVATION_NOT_ACTIVE: '预约已失效或已处理',
    BORROW_NOT_ACTIVE: '该借阅记录已结束',
    RENEW_LIMIT_REACHED: '续借次数已达上限（每本限 1 次）',
    RENEW_BLOCKED_BY_RESERVATION: '该书已被他人预约，无法续借',
    RENEW_BLOCKED_BY_OVERDUE: '该书记录已逾期，无法续借',
    COMPENSATION_ALREADY_PAID: '赔偿已登记完成，请勿重复操作'
  };

  var Dict = {};
  Object.keys(groups).forEach(function (key) { Dict[key] = groups[key]; });
  Dict.rejectReason = rejectReason;

  // 按枚举值跨组反查中文（各组字面互不重复，可安全平铺）。
  Dict.text = function (value) {
    if (value === undefined || value === null || value === '') return '';
    for (var key in groups) {
      if (Object.prototype.hasOwnProperty.call(groups[key], value)) return groups[key][value];
    }
    return '';
  };

  // 业务拒绝文案：优先后端 message（中文直显，不映射），缺失时按 code 兜底。
  Dict.rejectText = function (err) {
    if (err && err.message) return err.message;
    if (err && err.code && rejectReason[err.code]) return rejectReason[err.code];
    return '操作失败，请稍后重试';
  };

  window.Dict = Dict;
})();
