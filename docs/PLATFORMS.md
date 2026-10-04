# Web配布と各端末への展開

## 今回の実装範囲

Web/PWA版のビルド、レスポンシブUI、オフライン再起動、アプリ更新とセーブ保持まで実装。公開ホスティング先、ドメイン、ストア登録、署名済みネイティブアプリはこのリポジトリでは未設定。公開操作は行っていない。

## Webへの配置

1. `npm ci`、`npm run build` を実行。
2. `dist/` の中身をHTTPSの静的ホスティングへ配置する。ルートと `/guildquest/` のようなサブディレクトリの両方に対応。
3. `manifest.webmanifest` を `application/manifest+json`、`sw.js` をJavaScriptとして返す。`sw.js` とHTMLは再検証可能なCache-Controlを使い、長期不変キャッシュにしない。
4. HTML・JS・CSS・画像を同じリリースとして配置する。旧版を配信中に一部ファイルだけ削除しない。利用サービスの原子的デプロイを推奨。
5. 実URLで名前入力から派遣、再読み込み、オフライン、ホーム画面追加、更新後の保存維持を確認。

`file://` でHTMLを開く方法は対象外。localhost以外ではHTTPSが必要。HTTPのLANアドレスでは通常Service Workerが使えないため、スマホ実機検証はHTTPS配信を使う。

## インストール

- 対応するPC/Androidブラウザは、ブラウザのインストール操作、または画面下部「アプリをインストール」を利用する。
- iPhone/iPadは対応ブラウザの共有メニュー等からホーム画面追加。OSとブラウザによって名称・対応範囲は異なる。
- 初回はオンラインで起動し、全画像とアプリのキャッシュ完了表示を待つ。端末やブラウザがサイトデータを消した場合は再取得が必要。

PWAはブラウザ単位の保存を使う。異なるブラウザ・端末・配信ドメイン間でセーブは自動共有されない。バージョン更新はキャッシュだけを切り替え、localStorageを消さない。

実装判断の根拠: [Web app manifest](https://web.dev/learn/pwa/web-app-manifest)、[PWA installation](https://web.dev/learn/pwa/installation)、[MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)。

## スマホのネイティブ版

候補はCapacitor。既存の `dist/` をWebViewに梱包し、`src/core/` とストーリーデータを共用する。`webDir: dist` を採用し、ネイティブ環境ではService Worker登録を省くアダプターを追加する。Android/iOSのライフサイクル、セーフエリア、戻る操作、ファイル保存を端末側の責務にする。

次の実装で必要なもの: appIdの決定、Android Studio/Xcodeプロジェクト、端末の保存アダプター、ブラウザからのセーブ移行形式、署名、実機での休止・復帰とオフラインテスト。iOSの署名ビルドにはmacOS/Xcodeが必要。今回これらのビルド・配布は行っていない。

[Capacitor公式ドキュメント](https://capacitorjs.com/docs)、[環境要件](https://capacitorjs.com/docs/getting-started/environment-setup)。

## Windows版

現段階ではPWAを独立ウィンドウで利用できる。配布可能なWindowsアプリに進む場合はTauri 2を候補とし、`frontendDist: ../dist` として既存画面を梱包する。CoreをRustへ書き直す必要はない。通知やファイル保存を追加する場合だけホスト側APIを設ける。

次に必要なもの: Rust/MSVC環境、Tauri設定、アプリIDとアイコン、保存ディレクトリ、セーブ移行、MSI/NSISの作成、署名、インストール・アップデート・アンインストール検証。今回は未実装。

[Tauri frontend configuration](https://v2.tauri.app/start/frontend/)、[設定仕様](https://v2.tauri.app/reference/config/)。

## 保持する設計境界

- 判定と状態変更: Core。Web・PWA・各ネイティブホスト・autoplayで同じ関数を実行する。
- UI: 表示、入力、モーダル、画面サイズ。操作前にCore側で解放条件と状態を再確認する。
- ホスト: 保存先、インストール、更新、端末ライフサイクル。現状保存はブラウザ内で完結している。
- セーブ互換: campaign無しは旧ルールを保持。campaign.version=1は段階解放と章既読を保持し、prologueSeenと初回派遣完了introCompleteは別の状態として扱う。
