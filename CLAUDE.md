# PARASITE ECHO — Claude Code 引き継ぎメモ

ユーザー自身のゲーム企画書『PARASITE ECHO』を元に、claude.ai のチャットで作ってきたブラウザゲーム。
2026-11-15 時点、claude.ai 上で 3D 三人称視点版として公開中（アーティファクト版 `1794725589-df8b`、2026-11-15 生物グラフィック刷新版。URL https://claude.ai/artifact/ER2MxzP3PvcUxe2k6YGts2）。
ユーザーとのやりとりは日本語。

## ゲーム概要
- 寄生体（幼生）として生まれ、食物連鎖を「わざと喰われて乗っ取る」ことで登っていく生態系サバイバル。
- 階層 0〜6、15種族。勝利条件（対戦）：最初に第6階層《ヒグマ》の肉体を奪った者が勝ち。
- 乗っ取りは「ひとつ上の階層の捕食者」だけ（`canUsurp`）。逃げてアドレナリンを100まで溜め、臨界状態で喰われると乗っ取れる。
- 宿主には寿命（幼→成→老）。成熟期に同種の異性と交配すると、子に乗り移れる。
- モード：ひとりで遊ぶ（vs AI寄生体）／ひとりで生態系を育てる（協力ソロ）／オンライン対戦／オンライン協力（生態系の回復）。
- 入力：キーボード＋マウス、タッチ（左下固定スティック）、ゲームパッド。

## フォルダ構成
```
src/index.html      HTML/CSS/UI（three.js と game.js を <script src> で読む → そのままブラウザで開いて開発できる）
src/game.js         ゲーム本体（シミュレーション・3D描画・音・ネット・UI すべて、約2700行）
vendor/three.min.js three.js r160（改変なし）
vendor/peerjs.min.js PeerJS 1.5.4（MIT、source-map 行のみ削除）— claude.ai 以外でのオンライン用
tools/build.mjs     src + vendor → dist/index.html（1ファイルに全部インライン）
dist/index.html     公開用の単一ファイル（claude.ai アーティファクトにこれを載せている）
tests/smoke.mjs     ヘッドレス起動テスト（Playwright）
tests/mockroom.js   オンライン機能をローカルで試すための room API の代用品
archive/parasite-echo-2d-final.html  3D化直前の 2D 見下ろし版（参考・ロールバック用）
```
- 開発：`src/index.html` をブラウザで直接開けば動く（ビルド不要、file:// で可）。
- 公開用：`npm run build` → `dist/index.html`。外部ファイル・外部通信なしの1ファイルであることが条件（アーティファクトの CSP のため。フォントは Google Fonts のみ可）。
- テスト：`npm i` → `npx playwright install chromium` → `npm run build && npm test`。

## game.js の構成（セクション見出し `//  XXXX` で検索）
| セクション | 内容 |
|---|---|
| WORLD / BIOMES | `WORLD=4800`（2D版の面積4倍）、バイオームグリッド `BIO/EL/MO/WK/DPT`（`BC=4` px/セル）、シード付き生成 |
| 3D MODELS (`buildModels`) | 15種族＋食べ物・木・岩・茂みをプリミティブ（楕円体・チューブ）から手続き生成。頂点にアニメ用タグ（歩行・尾・翼・顎など）を持ち、頂点シェーダーで再生。遠景用の低ポリ版（`~` 付きキー）も生成。生物は `M_T=1.8` で分割数を上げ、`M_soften` で起動時に一度だけ「彫刻」する（部位の滑らかな結合＝SDFのsmooth union、色の継ぎ目をぼかす、関節やお腹にAOを焼き込み）。動く部位（脚・尾）は最大部位のグループ（胴体）へ片側だけ溶け込む。種族ごとのツヤは `GLOSSK` |
| GAME DATA | `TRAITS`（技・特性）、`SP0`→`SP`（種族定義：tier, size, speed, life, hab, pop …）。個体数は `POPK=4` 倍 |
| WORLD POPULATION | 装飾配置、個体の湧き、食べ物 |
| PLAYERS & MATCH | `NET`, `MATCH {mode: solo/host/client, kind: race/coop}`, `PLAYERS`, ローカルプレイヤー `P` |
| SKILL FX | `skfx(kind,x,y,a)` 種族技エフェクトの発生（ネット経由で他プレイヤーにも複製）。描画は `skill3d()` |
| COMBAT / RIVAL / AI / PLAYER CONTROL / UPDATE | ゲームロジック本体。`simWorld(dt)` が1ステップ。遠くの個体は間引き更新（LOD） |
| RENDERER (`bakeTerrain`〜`render`) | three.js。地形は高さテクスチャをカメラ追従グリッドで表示、水面・草（GPUインスタンス）・空・トゥーン＋アウトライン・ポスト処理（アドレナリン／瀕死／老衰などの画面演出）。共通GLSL `GLSL_ATMO`：`gust()` 風の波（草・樹冠・地面が同じ風）、`cloudSh()` 雲の影、`fogC()` 空気遠近＋太陽方向の霞＋朝夕の谷霧。`uWind`（JS側 `WIND`）、`uPush[8]`（草をかき分ける個体）、`BREATH`（生物だけ呼吸アニメ）。ポストは 1/4 解像度ブルーム＋太陽グレア |
| AMBIENT LIFE (`ambientTick` / `r3Ambient`) | 見た目だけのローカル演出（非同期・ゲーム性なし）：蝶・トンボ・鳥の群れ・跳ねる魚・落ち葉・足元の土煙・水の波紋 |
| `r3Camera` | 三人称オービットカメラ。右ドラッグ／矢印／右スティックで回転、ホイールでズーム、横移動中は自動で背後に回り込む |
| AUDIO / ADAPTIVE BGM | 効果音と、状態・種族で変わる自作BGM（すべて WebAudio で合成） |
| INPUT | `pollInput()`。移動はカメラ基準に変換して `IN.mx/IN.my` へ |
| NETWORK | ホスト権威型。claude.ai アーティファクトの `room` 機能（`window.claude.use('room')`）を使用。同期部屋 `pe-<code>`（スナップショット）と情報部屋 `pi-<code>`。claude.ai 以外（GitHub Pages 等）では `p2pLobby()` が同じ presence API を PeerJS（WebRTC、シグナリングは 0.peerjs.com の無料サーバー）で代替：ホストの Peer ID は `parasite-echo-v1-<code>`、ホストがハブとして presence を中継。公開ルーム一覧は無く、4文字コード入力か招待リンク `#join=<code>` で参加。TURN 無しなので回線の組み合わせによっては繋がらない |
| FIELD MAP | 霧の晴れる探索マップ、ミニマップ、全体マップ（N キー） |
| MAIN LOOP / BOOT | `loop()`、`boot()` |

### 押さえておくべき設計
- **シミュレーションは 2D 平面 (x, y)**、描画だけ 3D。3D座標は `(x, 高さ, y)`。高さは `heightAt(x,y)`（見た目のみ、当たり判定には使わない）。水面は高さ 0。
- 描画は毎フレーム「インスタンス配列に詰めて一括描画」（`BATCH[...]`, `bPush`, `qFlat`/`qBill`/`qBeam` の板ポリ）。three.js のオブジェクトを個体ごとに作らない。
- `cam.x / cam.y / GW / GH` は 2D 時代の「注目範囲」で、カリング・音量・マップに今も使っている。
- 自動テスト環境では `navigator.webdriver` により描画を軽量化する（URL末尾 `#hq` で無効化）。
- オンラインは claude.ai 上でしか動かない（ローカルでは `tests/mockroom.js` を2つのブラウザコンテキストに注入し、`__send`/`__recv` を中継すれば試せる）。

## テストで使っている内部フック（コンソールからも使える）
`startSolo('race'|'coop')`, `spawnCreature(key,x,y,age)`, `setHost(P, creature)`, `removeCreature(c)`, `P`（自分）, `creatures`, `SPAWN`, `dayT`（0〜1 の時刻）, `skfx(...)`, `setMap(true)`, `jingle(name)`, `MUS`（BGM状態）

## これまでの経緯（ユーザーの依頼順）
1. 企画書PDF → 2D見下ろしのリッチなブラウザゲームとして実装
2. スマホ操作の左下固定スティック、カメラを寄せる、海・川・沼と水生生物の追加
3. オンライン対戦（最初に頂点を取る競争）、コントローラー対応
4. 寿命サイクルを長く落ち着いたものに、オンライン協力モード（生態系の再建）
5. 今風のデフォルメアニメ調（イメージはゼルダの伝説）、バランステスト
6. BGM（陽気が基本、状態で変化、種族ごとのアレンジ）
7. 種族技の動的エフェクト、フィールド4倍、マップ機能
8. 2D見下ろし → 3D三人称視点に変更
11. **Claude なしでもオンライン（最新）**：claude.ai の外では PeerJS による P2P に自動で切り替え。ルームコード参加・招待リンク
10. 生物グラフィック刷新：ポリゴン感を消す彫刻パス（`M_soften`）、柔らかい光の回り込み・毛並み/皮膚のまだら・濡れたツヤ・空の縁光、生物の輪郭線を細く色付きに
9. グラフィック強化（ブレワイ風の「生きている世界」）：風の波・樹冠のふんわり化と揺れ・雲の影・空気遠近・ブルーム/グレア・呼吸・環境生物。RTX 3080 Ti で旧版と同シード比較し描画時間の差は誤差範囲（約3ms/フレーム）

## ローカル環境メモ
- このPCには Node.js が入っていない。プレビューは `.claude/launch.json`（Python の `http.server`、`http://localhost:5177/src/index.html`）。ビルドは Node があれば `npm run build`、無ければ同等の Python スクリプトで `dist/index.html` を生成した（src の2つの `<script src>` を中身で置換するだけ）。

バランス目安（自動ボット）：対戦でヒグマ到達は中央値およそ11分、AI寄生体の勝利はおよそ17〜19分。

## 未確認・次にやるとよいこと
- **実機（GPUあり）でのフレームレート未計測**。開発環境はソフトウェア描画だったため。重い端末では解像度を自動で下げる処理（`r3Adapt`）あり。
- 三人称で背後が見えにくくなったので、人間が遊んだときの難しさは要確認（自動テストでは測れない）。
- 3D化に合わせて、地形の起伏（崖・高台）をゲームプレイに使う余地がある（現状は見た目のみ）。

## 公開
- GitHub：https://github.com/kt2reft/parasite-echo （Public、ライセンスなし）。`main` へ push すると GitHub Actions（`.github/workflows/pages.yml`）がビルドして GitHub Pages https://kt2reft.github.io/parasite-echo/ に公開。Pages 版でもオンラインは P2P（PeerJS）で遊べる（Claude アカウント不要。ルームコード／招待リンクで参加）。コミットの名義は `kt2reft` / GitHub の noreply メール。
- claude.ai のアーティファクト（slug `6ca17dfa-0669-428f-b336-6fbce9923929`、現在ウェブ公開中）。
- 更新するときは `dist/index.html` を差し替える。公開中なので、更新はリンクを持つ全員にすぐ反映される点に注意。
