# Solo Darts Stats

スマートフォンで自分のソフトダーツの結果を1投ずつ記録するPWAです。1人練習に加え、対戦中に自分のスタッツだけを記録する用途にも利用できます。バックエンド、ログイン、クラウド同期、アクセス解析は使用せず、進行中ゲームと履歴を利用端末のIndexedDBだけに保存します。

> 本アプリはDARTSLIVE公式アプリではありません。DARTSLIVEのロゴ、画像、画面デザインは使用していません。

## 対応ゲーム

- 501 / 701
  - Straight Out（Open Out）
  - Master Out（Double、Triple、Outer BULL、Inner BULL）
  - 15ラウンド、20ラウンド、上限なし
  - Double Outは初版の対象外
- 1人用クリケット
  - 対象: 20、19、18、17、16、15、BULL
  - 20ラウンドモード（60投）
  - 全クローズモード
  - 対戦終了時などに、途中の投球数でもスタッツを確定・保存できる手動終了

全ゲームで1〜20、Single / Double / Triple、Outer / Inner BULL、MISSを入力できます。1投ごとにセグメント、倍率、得点、マーク、ラウンド、投順、日時、BUST状態を保存します。UNDOは保存済み投球列から全状態を再計算します。

## 主な機能

- ホーム、ゲーム設定、01プレイ、クリケットプレイ、結果、履歴
- BUST、アウト条件、ラウンド上限の自動判定
- プレイ中に現時点の80％スタッツと全投スタッツをリアルタイム表示
- 結果画面で80％スタッツと全投スタッツを併記
- クリケットの「ゲーム終了」（履歴保存）と「ゲーム中止」（履歴対象外）を分離
- ゲーム種別ごとの直近10、直近30、全期間集計
- 各投入力直後のIndexedDB保存と進行中ゲーム再開
- 履歴の個別削除・確認付き全削除
- 320px以上、縦向き、セーフエリア、44px以上のタップ領域に対応
- iPhone 15（393×852px）のPWA縦向きを主基準に、プレイ画面を可能な限り1画面へ収めるコンパクト表示
- Manifest / Service Worker / オフライン起動 /自動キャッシュ更新

## 使用技術とバージョン

実装時にnpmレジストリと公式ドキュメントで現行版・互換範囲を確認し、ロックファイルで固定しています。

| 技術 | バージョン |
| --- | ---: |
| TypeScript | 6.0.3（strict） |
| Vite | 8.2.1 |
| vite-plugin-pwa | 1.3.0 |
| Workbox Window | 7.4.1 |
| Vitest | 4.1.10 |
| ESLint | 10.8.1 |
| typescript-eslint | 8.66.0 |
| fake-indexeddb | 6.2.5（テスト専用） |
| pnpm | 11.16.0 |
| Node.js | 24.x |

React、VueなどのUIフレームワークは使用していません。実行時の外部依存、外部フォント、外部画像、バックエンドAPIもありません。

## Windows PowerShellでの開発環境構築

Node.js 24.x とGitをインストール後、PowerShellで次を実行します。

```powershell
git clone <リポジトリURL>
Set-Location <リポジトリ名>
npm install --global pnpm@11.16.0
pnpm install --frozen-lockfile
```

### 起動

```powershell
pnpm dev
```

表示されたローカルURLをブラウザで開きます。同一LANのスマートフォンから確認する場合は `pnpm dev --host` を利用してください。

### 型チェック、Lint、テスト

```powershell
pnpm typecheck
pnpm lint
pnpm test
```

### 本番ビルドとプレビュー

```powershell
pnpm build
pnpm preview
```

ビルド成果物は `dist` に生成されます。`vite preview` はローカル検証専用です。

## GitHub Pagesへの公開

1. GitHubリポジトリの既定ブランチを `main` にします。
2. Settings → Pages → Build and deployment → Source で **GitHub Actions** を選択します。
3. `main` にpushします。
4. `.github/workflows/deploy-pages.yml` が型チェック、Lint、単体テスト、本番ビルドに成功した場合だけPagesへデプロイします。

Viteの `base` はActions上の `GITHUB_REPOSITORY` からリポジトリ名を取得し、`/<リポジトリ名>/` に自動設定します。ローカルでは `/` です。Manifestの `start_url` / `scope` とService Workerも同じベースパスへ追従します。

参考: [Vite公式 GitHub Pagesデプロイ](https://ja.vite.dev/guide/static-deploy.html)、[GitHub公式 Pages公開元設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## データ保存とプライバシー

保存先は利用ブラウザのIndexedDB（DB名 `solo-darts-stats`）だけです。投球を入力するたびに進行中セッション全体を保存します。外部サーバーへの送信、クラウド同期、ログイン、Google Analytics等のアクセス解析はありません。

**ブラウザのサイトデータを削除すると、進行中ゲームとすべての履歴が消えます。** 初版にJSONバックアップ・復元機能はありません。Safariのストレージ管理やOSによるデータ削除の影響も受けます。

スキーマ版は各 `GameSession` に保持し、IndexedDB自体にもバージョンを設定しています。将来のマイグレーションは `onupgradeneeded` に追加します。同時に再開対象となる進行中ゲームは1つだけです。

## 80％スタッツの定義

画面上は必ず **「80％スタッツ（DARTSLIVE方式を1人用に準用）」** と表記します。DARTSLIVE公式では1人プレイは標準スタッツ反映対象外であり、本アプリは公式スタッツや完全互換を名乗りません。レーティングとフライトも算出しません。

### 01

- 501は、ラウンド終了時に残り100点以下へ到達した最初のラウンド全体まで。
- 701は、ラウンド終了時に残り140点以下へ到達した最初のラウンド全体まで。
- 未到達で終了した場合は全投。
- BUSTラウンドの有効得点は0ですが、実際に入力した投数は分母に含めます。
- `PPD = 有効得点 ÷ 投数`、`PPR = PPD × 3`。

### クリケット

- 6つ目のナンバーをクローズしたラウンド全体まで。未到達なら全投。
- 全クローズモードでも6つ目を閉じたラウンドを境界として集計します。同じラウンド内でその後に実際に投げたダーツは「ラウンド全体」に含めます。
- クローズ後に同じ対象へ入ったマークも総マーク数へ加算します。
- `MPR = 総マーク数 ÷ 投数 × 3`。

参考: [DARTSLIVE公式 スタッツやレーティングの詳細](https://dlservicehelp.dartslive.com/hc/ja/articles/360058145813-%E3%82%B9%E3%82%BF%E3%83%83%E3%83%84%E3%82%84%E3%83%AC%E3%83%BC%E3%83%86%E3%82%A3%E3%83%B3%E3%82%B0%E3%81%AE%E8%A9%B3%E7%B4%B0)、[スタッツとレーティングについて](https://dlservicehelp.dartslive.com/hc/ja/articles/360056292074-%E3%82%B9%E3%82%BF%E3%83%83%E3%83%84%E3%81%A8%E3%83%AC%E3%83%BC%E3%83%86%E3%82%A3%E3%83%B3%E3%82%B0%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6)

## 公式仕様と本アプリ独自仕様

[DARTSLIVE ASIA公式ルールブック Ver.10.1](https://dl.cdn.dartslive.com/com/wp-content/uploads/2025/02/12004845/DARTSLIVE_ASIA_rulebook_V10_1.pdf)では、01の標準15ラウンド、01のSingle/Double BULLがともに50点、クリケット対象15〜20/BULL、各対象3マークが確認できます。

本アプリではユーザー指定により次を独自仕様として固定しています。

- Double Outは提供しません。
- 01のOuter BULL / Inner BULLはともに50点ですが入力履歴では区別します。
- Master OutはDouble、Triple、Outer BULL、Inner BULLを有効な上がりとします。
- Master Outで残り1点、マイナス、無効な0点はBUSTです。
- クリケットは対戦点を計算せず、1人用のマーク練習として記録します。
- 1人用80％集計の閾値・式は上記のアプリ内定義です。

## PWA / オフライン

`vite-plugin-pwa` の `generateSW` を使い、ビルド時にHTML、JS、CSS、Manifest、192px / 512pxアイコンをプリキャッシュします。古いキャッシュは削除し、更新版のService Workerは自動適用します。初回オンライン表示後は、オフラインでもアプリ起動、ゲーム記録、再開、履歴表示が可能です。画面消灯防止APIは使用しません。

## 既知の制約

- 端末間同期、ログイン、クラウド保存、JSONバックアップはありません。
- Double Out、相手側のスコア・マーク記録、レーティング、フライトはありません。
- 画面消灯はOS / ブラウザ設定に従います。
- PWAインストール方法やストレージ保持方針はブラウザ・OSで異なります。
- GitHub PagesはHTTPS配信ですが、初回アクセスだけはネットワーク接続が必要です。
