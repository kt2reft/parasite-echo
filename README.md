# PARASITE ECHO

寄生体として生まれ、食物連鎖を「わざと喰われて乗っ取る」ことで登っていく、3D 生態系サバイバルゲーム。

**▶ ブラウザで遊ぶ：https://kt2reft.github.io/parasite-echo/**

最初に食物連鎖の頂点《ヒグマ》の肉体を奪った寄生体が勝者。

## 遊び方

- 最弱の寄生幼生として、小さな生物に寄生する
- ひとつ上の階層の捕食者から**本気で逃げて**アドレナリンを 100 まで溜め、臨界状態で**あえて喰われる**とその肉体を乗っ取れる
- 宿主には寿命がある。成熟期に同種の異性と交配すれば、子に乗り移れる
- 階層 0〜6、15 種族（陸・川・沼・海）

### 操作

| | キーボード / マウス | ゲームパッド | タッチ |
|---|---|---|---|
| 移動 | WASD（Shift で擬態歩き） | 左スティック | 左下スティック |
| 視点 | 右ドラッグ / 矢印キー、ホイールでズーム | 右スティック | 画面ドラッグ |
| 攻撃・丸呑み | J / 左クリック（長押し） | A | 攻撃ボタン |
| 技 / 求愛 / オーバードライブ | K / L / Space | X / Y / R2 | 各ボタン |
| マップ | N | Back | ミニマップをタップ |

### モード

- **ひとりで遊ぶ**：正体を隠した AI 寄生体 5 体と頂点を競う
- **ひとりで生態系を育てる**：痩せた森で繁殖し、全 14 種を健全な数に戻す協力モード
- オンライン対戦・協力は claude.ai のアーティファクト機能を使うため、GitHub Pages 版では利用できません

## 開発

```
src/index.html   HTML / CSS / UI
src/game.js      ゲーム本体（シミュレーション・3D描画・音・ネット）
vendor/          three.js r160（MIT License）
tools/build.mjs  src + vendor → dist/index.html（1ファイルにまとめる）
```

- `src/index.html` をローカルサーバー経由でブラウザで開けば、そのまま動きます
- `npm run build` で公開用の `dist/index.html` を生成
- `main` に push すると GitHub Actions がビルドして GitHub Pages に公開します

## ライセンス

ゲーム本体（`src/`、`tools/`、`tests/`、`archive/`）の著作権は作者に帰属します。無断での転載・再配布はご遠慮ください。
`vendor/three.min.js` は [three.js](https://github.com/mrdoob/three.js)（MIT License, Copyright © 2010-2023 three.js authors）です。
