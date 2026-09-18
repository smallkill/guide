# Tomica 收藏圖鑑:自建說明(給 AI 讀的交接文件)

> 給 AI 的指示:這份文件描述一個純靜態的收藏圖鑑網站。請依「AI 負責」段落完成工作,
> 遇到「人類手動」段落時停下來,明確告訴使用者要做什麼、等他做完再繼續。
> 範例站(可直接開來看成品長什麼樣): <https://smallkill.github.io/guide/tomica/>

---

## 0. 網站結構(只有三樣東西,沒有 build 步驟)

```
tomica/
├── index.html        ← 前端,不用改(讀 cars.json 動態產生卡片、搜尋、篩選、燈箱)
├── cars.json         ← 資料庫,一台車一筆
└── images/
    ├── box/          ← 網路抓的「包裝盒」照(展示首選)
    ├── loose/        ← 網路抓的清楚「裸車/官方商品」照(次選)
    └── raw/          ← 使用者自己拍的照片(只當縮圖列裡的「我拍的」,不當主圖)
```

index.html 原檔直接下載:
https://raw.githubusercontent.com/smallkill/guide/main/tomica/index.html

---

## 1. 人類手動:準備照片

1. 把收藏拍照(一張裡有幾台都可以,清楚即可)。
2. 全部放進一個資料夾交給 AI(例如 `photos/`)。

---

## 2. AI 負責:辨識與建檔

對每張照片:
1. 判斷裡面有幾台車,一台一筆。
2. 上網查每台車的:Tomica 番號(No.)、英文名、日文名、中文名、發售年、系列
   (Regular / Premium / Gift / Dream / Disney Motors / 地方限定…)、分類、關鍵字。
3. 找**官方包裝盒照**下載到 `images/box/`;找不到就找清楚的官方裸車照放 `images/loose/`。
   **絕對不要**拿使用者自拍照當主圖,自拍照只複製進 `images/raw/`。
4. 查不到或不確定的 → `confidence: "low"`,並列進一份 `needs_help.md` 給人類。

### 檔名規則
`t{番號}_{英文slug}.jpg`,例:`t108_toyota-crown-patrol.jpg`;無番號用 `tNA01`、`tNA02`…
同番號不同年代撞號時加 `_a` / `_b`。

### cars.json 格式(必須完全照這個)
```json
{
  "updated": "2026-09-18",
  "count": 2,
  "build": 1789275356,
  "cars": [
    {
      "id": "t03_type90-tank",
      "number": "03",
      "name_en": "JSDF Type 90 Tank",
      "name_ja": "自衛隊 90式戦車",
      "name_zh": "陸上自衛隊 90式戰車",
      "year": "",
      "series": "Tomica Premium",
      "category": ["軍事車輛", "戰車"],
      "keywords": ["Type 90 Tank", "90式戦車", "JSDF", "1/124"],
      "source_images": ["https://www.takaratomy.co.jp/...", "IMG_3146.jpg"],
      "box_image": "",
      "loose_image": "t03_type90-tank.jpg",
      "main_image": "loose/t03_type90-tank.jpg",
      "has_image": true,
      "confidence": "high",
      "notes": "查證備註",
      "photos": ["loose/t03_type90-tank.jpg", "raw/IMG_3146.jpg"],
      "ip": "",
      "size": "標準",
      "has_official": true
    }
  ]
}
```

欄位重點:
- `main_image`:相對 `images/` 的路徑,`box/xxx.jpg` 或 `loose/xxx.jpg`;沒圖給 `""`(會顯示 🚗 佔位)。
- `photos`:燈箱縮圖列,順序 = 主圖在前、`raw/` 自拍在後。
- `ip`:聯名 IP(吉卜力、Disney、Mario…)沒有留 `""`。
- `size`:`標準` / `Long` / `Big` 等。
- `build`:任意整數,每次更新圖片時換一個新數字(用來破快取)。
- `count`:cars 陣列長度。

---

## 3. 人類手動:補洞

AI 交出 `needs_help.md` 後,人類逐項:
- 告訴 AI 正確車名 / 番號(通常看盒底或車底刻字就有)。
- 或自己找一張盒裝圖丟給 AI。
AI 收到後更新 cars.json 對應那筆,`confidence` 改 `high`。

---

## 4. AI 負責:組裝與本機預覽

1. 把 `index.html`、`cars.json`、`images/` 放進同一個資料夾。
2. 本機起一個靜態伺服器確認可以開(fetch 需要 http,不能直接雙擊檔案):
   ```
   python3 -m http.server 8000
   ```
   開 http://localhost:8000 檢查:卡片都有圖、搜尋 / 篩選正常、點卡片燈箱能切圖。
3. 用腳本檢查每筆 `main_image` / `photos` 指到的檔案都存在。

---

## 5. 人類手動:上線到 GitHub Pages

1. 在 GitHub 建一個 repo(例如 `my-tomica`),public。
2. 把整個資料夾 push 上去(AI 可以幫忙 git 指令,但登入 / 授權要人類自己做)。
3. GitHub → repo → **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**。
4. 等 1~2 分鐘,網址是 `https://<帳號>.github.io/my-tomica/`。

之後要加車:重跑第 2 步只處理新照片,append 進 cars.json,改 `count` 與 `build`,再 push。

---

## 分工總表

| 步驟 | 誰 | 做什麼 |
|---|---|---|
| 1 拍照 | 人 | 拍收藏、交資料夾 |
| 2 建檔 | AI | 辨識、查資料、抓盒裝圖、寫 cars.json |
| 3 補洞 | 人 | 回答 needs_help 的問題 |
| 4 組裝預覽 | AI | 合併檔案、本機檢查 |
| 5 上線 | 人 | 建 repo、開 Pages(AI 可陪跑 git) |
