"""Sentence chunker cho pipeline streaming voice.

Nhận một luồng token (async generator các đoạn text rời rạc từ LLM) và gom
chúng lại thành TỪNG CÂU hoàn chỉnh. Mỗi khi đủ một câu (gặp dấu kết câu
. ! ? … theo sau là khoảng trắng/cuối chuỗi, đủ độ dài tối thiểu, không phải
viết tắt/số thập phân) thì yield ngay câu đó để tầng TTS tổng hợp sớm.

Nhờ vậy người dùng nghe được câu đầu của AI ngay khi LLM mới sinh xong câu đó,
thay vì phải chờ toàn bộ phản hồi (giảm time-to-first-audio).
"""

import re

# Dấu kết câu (gồm cả tiếng Việt/CJK)
_SENTENCE_END = re.compile(r"[.!?…。！？]+")
# Một vài viết tắt phổ biến để tránh cắt nhầm sau dấu chấm
_ABBREVIATIONS = {"vd", "tp", "ts", "ths", "mr", "mrs", "ms", "dr", "vs", "etc", "no"}
_MIN_SENTENCE_LEN = 12


def _looks_like_false_stop(buffer: str) -> bool:
    """True nếu dấu chấm vừa gặp KHÔNG nên coi là kết câu (số thập phân,
    viết tắt) -> tiếp tục gom thêm token."""
    stripped = buffer.rstrip()
    if not stripped:
        return True
    # Số thập phân: ...3.14
    if len(stripped) >= 2 and stripped[-1] == "." and stripped[-2].isdigit():
        return True
    # Viết tắt: lấy từ cuối trước dấu chấm
    last_word = re.split(r"[\s]", stripped.rstrip("."))[-1].lower()
    if last_word in _ABBREVIATIONS:
        return True
    return False


async def sentence_stream(token_iter):
    """Async generator: gom token -> yield từng câu hoàn chỉnh.

    `token_iter`: async iterable trả về các đoạn text (delta) từ LLM.
    """
    buffer = ""
    async for delta in token_iter:
        if not delta:
            continue
        buffer += delta

        # Cắt liên tục mọi câu đã hoàn chỉnh trong buffer.
        # `search_from` cho phép bỏ qua các dấu chấm "giả" (số thập phân/viết
        # tắt) hoặc đoạn quá ngắn, dò tiếp dấu kết câu hợp lệ ở sau.
        search_from = 0
        while True:
            match = _SENTENCE_END.search(buffer, search_from)
            if not match:
                break
            end = match.end()
            candidate = buffer[:end]
            if len(candidate.strip()) < _MIN_SENTENCE_LEN or _looks_like_false_stop(candidate):
                # Dấu kết câu chưa hợp lệ -> dò tiếp sau vị trí này
                search_from = end
                continue
            sentence = candidate.strip()
            if sentence:
                yield sentence
            buffer = buffer[end:]
            search_from = 0

    # Phần còn lại (câu chưa có dấu kết) -> yield nốt
    tail = buffer.strip()
    if tail:
        yield tail
