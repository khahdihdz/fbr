# FB Watch Progress

Web app (PWA) theo dõi tiến trình xem video **trong app Facebook**. Dữ liệu chỉ nằm trên máy bạn.

- Trang web: https://khahdihdz.github.io/fbr/
- Hướng dẫn cài: https://khahdihdz.github.io/fbr/install.html
- Chính sách riêng tư: https://khahdihdz.github.io/fbr/privacy.html

---

## Đọc phần này trước — giới hạn không thể vượt qua

> **Một trang web KHÔNG THỂ tự động đọc tiến trình phát video từ app Facebook native.**

Trình duyệt chạy trong sandbox. Không có API web nào cho phép một trang web đọc `MediaSession`,
giao diện, hay vị trí phát của một ứng dụng khác. `navigator.mediaSession` chỉ phản ánh media của
chính trang web đó, không phải của app Facebook. Đây là giới hạn của hệ điều hành, không phải hạn
chế của đoạn code này.

Vì vậy webapp này dùng bốn kênh thu thập, và **không kênh nào là "đọc trực tiếp từ app Facebook"**:

| # | Kênh | Mức tự động | Độ chính xác | Nền tảng |
|---|------|-------------|--------------|----------|
| 1 | **Web Share Target** — chia sẻ link từ app Facebook vào webapp | Gần tự động (1 tap) | Biết link, chưa biết vị trí | Chrome/Edge Android khi PWA đã cài |
| 2 | **Session timer** — mở video, quay lại webapp để xác nhận | Gần tự động (1 tap) | Ước lượng theo thời gian vắng mặt, có thể sai | Mọi nền tảng |
| 3 | **Facebook “Download your information”** | Thủ công | Chính xác về danh sách, không có phút:giây | Mọi nền tảng |
| 4 | **Dán link / nhập tay** | Thủ công | Chính xác theo những gì bạn nhập | Mọi nền tảng |

Không có kênh nào ghi dữ liệu mà không có sự tham gia của bạn. Mọi bản ghi đều mang nhãn nguồn và
độ tin cậy; dữ liệu `low` (ước lượng) **không bao giờ** được trộn lẫn hiển thị với dữ liệu `high`.

### Safari trên iOS

Safari chưa hỗ trợ nhận Web Share Target vào PWA. Trên iPhone/iPad bạn phải sao chép link và dán vào
tab **Nhập**, hoặc dùng kênh 3.

---

## Kiến trúc

```
src/
  types.ts                 hằng số + kiểu dữ liệu dùng chung
  app.ts                   router hash, xử lý share, phiên ước lượng
  main.ts                  bootstrap + đăng ký service worker
  db/
    idb.ts                 wrapper IndexedDB
    schema.ts              object store, index, migrateVideo()
    repo.ts                lớp lưu trữ (không chứa logic lọc/sắp xếp)
  progress/
    percent.ts             tính phần trăm, cờ hoàn thành
    estimate.ts            ước lượng từ session timer (hàm thuần)
    merge.ts               gộp bản ghi, tạo bản ghi mới
    confidence.ts          ánh xạ nguồn → độ tin cậy
    stats.ts               số liệu tổng hợp
    session.ts             lưu phiên “rời webapp để xem video”
  video/
    videoId.ts             chuẩn hoá ID/URL Facebook
    deepLink.ts            sinh `fb://` và fallback https
  import/
    fbrJson.ts             schema fbr.progress.v1, export JSON/CSV
    fbDyi.ts               dò lịch sử xem trong file export của Facebook
    urls.ts                dán link hàng loạt
  share/shareTarget.ts     Web Share Target
  ui/                      các màn hình và thành phần giao diện
shared/fixtures/           fixture URL dùng chung cho test
public/                    manifest, service worker, icon, trang tĩnh
scripts/                   sinh icon PNG, chèn danh sách precache
```

Không có runtime dependency. Dev dependency: Vite, TypeScript, Vitest, ESLint, `fake-indexeddb`.

### Hợp đồng dữ liệu

```jsonc
{
  "schema": "fbr.progress.v1",
  "exportedAt": 1700000000000,
  "app": "fbr-web",
  "videos": [
    {
      "id": "1234567890123456",
      "url": "https://www.facebook.com/watch/?v=1234567890123456",
      "title": "…",
      "source": "share_target",           // share_target | session_estimate | manual | fb_export | link_paste
      "confidence": "low",                // high | medium | low
      "resolvedBy": "url",                // url | shortlink | hash | unknown
      "durationSec": 615,
      "positionSec": 222,
      "percent": 36.1,
      "completed": false,
      "watchCount": 2,
      "totalWatchedSec": 410,
      "firstSeenAt": 1700000000000,
      "lastWatchedAt": 1700000000000,
      "needsReview": false
    }
  ]
}
```

Khi gộp hai bản ghi cùng `id`, thứ tự quyết định là:
độ tin cậy nguồn → `lastWatchedAt` mới hơn → `positionSec` lớn hơn → `durationSec` lớn hơn.
`watchCount` và `totalWatchedSec` lấy giá trị lớn hơn để tránh đếm trùng khi import.

---

## Phát triển ở máy

Yêu cầu: Node.js 22 trở lên.

```bash
npm ci
npm run dev          # http://localhost:5173/fbr/
npm run typecheck
npm test
npm run lint
npm run build        # typecheck + vite build + chèn precache vào sw.js
npm run preview      # xem thử bản build tại http://localhost:4173/fbr/
npm run gen:icons    # sinh lại icon PNG trong public/icons
```

Service worker chỉ được đăng ký ở bản production (`import.meta.env.PROD`).

---

## Triển khai

Một workflow duy nhất: `.github/workflows/deploy.yml`.

- Chạy khi push lên `main` (chỉ khi file liên quan thay đổi) hoặc chạy tay bằng `workflow_dispatch`.
- Các bước: `npm ci` → `lint` → `typecheck` → `test` → `build` → `upload-pages-artifact` → `deploy-pages`.
- Quyền tối thiểu: `contents: read`, `pages: write`, `id-token: write`.
- **Không dùng secret nào.** Không có bước nào cần token ngoài `GITHUB_TOKEN` mặc định.

Pages được bật với `build_type: workflow` (không dùng nhánh `gh-pages`).

`base` của Vite là `/fbr/` nên URL là `https://khahdihdz.github.io/fbr/`.

Lưu ý: GitHub Pages không có rewrite cho SPA, nên `public/share/index.html` tồn tại để
`/fbr/share?url=…` hoạt động: trang này nhận tham số Web Share Target, cất vào `sessionStorage`,
rồi chuyển vào app ở `#/share`.

---

## Kiểm chứng trên máy thật

Đây là phần quan trọng nhất và **không thể thay thế bằng test tự động**: không có test nào trong CI
xác nhận được kênh 1 và kênh 2 chạy trên điện thoại của bạn.

1. Cài PWA lên màn hình chính.
2. Vào tab **Chẩn đoán** (`#/probe`).
3. Chia sẻ một video từ app Facebook vào webapp → quay lại tab Chẩn đoán, phải thấy sự kiện `share_received`.
4. Bấm **▶ Xem tiếp** trên một card, xem vài phút trong app, quay lại → phải thấy `session_returned` và
   hộp thoại xác nhận.
5. Nếu một kênh không chạy: bấm **Tải log .json** và gửi lại kèm mô tả.

Nhật ký này là bằng chứng duy nhất. Không có nó thì không thể khẳng định kênh nào đang hoạt động.

---

## Quyền riêng tư

- Không server, không tài khoản, không analytics, không telemetry, không cookie theo dõi.
- Dữ liệu tiến trình: IndexedDB trên thiết bị. Tuỳ chọn và nhật ký: `localStorage`. Phiên: `sessionStorage`.
- Chỉ hai loại request ra ngoài, cả hai đều không gửi dữ liệu của bạn:
  1. Ảnh thumbnail `https://graph.facebook.com/<id>/picture` (có ảnh thay thế nếu lỗi).
  2. Đồng bộ tuỳ chọn tới endpoint do bạn tự cấu hình — mặc định **tắt**.
- Không dùng API nội bộ Facebook, không scraping, không nhúng SDK/iframe của Facebook,
  không tự động hoá thao tác nào trên app Facebook.

---

## Thêm backend đồng bộ (tuỳ chọn)

Webapp đã có sẵn chỗ nối, mặc định tắt:

1. Dựng một endpoint nhận `POST` JSON theo schema `fbr.progress.v1`.
2. Xác thực bằng header `Authorization: Bearer <token>`.
3. Trong webapp: **Cài đặt → Đồng bộ**, nhập endpoint và token, rồi bật.

Endpoint, token và cờ bật/tắt chỉ lưu trong `localStorage` của trình duyệt bạn. Không có giá trị mặc
định nào được hardcode trong mã nguồn.

---

## Giới hạn đã biết

- Link rút gọn `l.facebook.com/l.php?u=…` không được giải mã (cần request mạng). Chúng rơi vào trạng
  thái `unknown` và xuất hiện ở tab **Cần rà lại**.
- Định dạng file export của Facebook thay đổi theo thời gian và theo ngôn ngữ. Bộ dò trong
  `src/import/fbDyi.ts` tìm theo hình dạng dữ liệu chứ không hardcode đường dẫn; nếu không nhận diện
  được, nó báo rõ và **không** nhập dữ liệu rác.
- Deep link `fb://` không được Facebook tài liệu hoá công khai. Mọi lần mở đều có fallback sang https
  sau 700 ms.
- `totalWatchedSec` cộng dồn theo giá trị lớn nhất khi gộp, nên có thể thấp hơn thời gian xem thật
  nếu bạn xem lại cùng một video nhiều lần qua các kênh khác nhau.
- Biểu đồ ở tab Thống kê đếm **số video có hoạt động trong ngày**, không phải thời lượng xem.

## Giấy phép

Chưa đặt. Thêm `LICENSE` nếu bạn muốn công bố điều kiện sử dụng.
