// Authored structure directly transplanted from prototype/index.html. No fixture runtime.
export const template = `<main>
  <div id="mobile-paper-home"></div>
  <div class="journey" id="journey">
    <div class="stage" id="stage">
      <div class="world" id="world">
        <div id="paper-object" class="paper-object">
@@NEWSPAPER@@
          <div id="folding" class="folding" aria-hidden="true" inert></div>
        </div>
        <section class="bag-scene" id="instruments" tabindex="-1" aria-label="随身仪表">
          <div class="bag-art bag-back" aria-hidden="true"></div>
          <div class="devices">
            <button class="device wind-device" type="button" data-device="wind" data-model="HF-96" data-maker="HIKARI FIELD" data-owner="H.K."><img src="/objects/wind-photo-v3.png" alt=""><span class="lcd wind-lcd"><small>风</small><strong data-value="wind-label">@@WIND_LABEL@@</strong><span data-value="wind-short">@@WIND_SHORT@@</span></span></button>
            <button class="device direction-device" type="button" data-device="direction" data-model="SD-21" data-maker="HIKARI FIELD" data-owner="H.K."><img src="/objects/solar-direction-v1.png" alt=""><span class="sun-dial" aria-hidden="true"><i class="north">N</i><i class="east">E</i><i class="south">S</i><i class="west">W</i><span class="sun-hand"></span><small>太阳</small></span><span class="lcd direction-lcd"><span data-value="sun-label">@@SUN_LABEL@@</span></span></button>
            <button class="device light-device" type="button" data-device="light" data-model="LM-21" data-maker="HIKARI FIELD" data-owner="H.K."><img src="/objects/light-meter-v2.png" alt=""><span class="lcd light-lcd"><strong data-value="light-label">@@LIGHT_LABEL@@</strong><span data-value="light-short">@@LIGHT_SHORT@@</span></span></button>
            <button class="device weather-card" type="button" data-device="weather" data-model="WC-21" data-maker="逐光记录" data-owner="H.K."><span class="card-heading">气象记录 <small>@@LOCATION_DATE@@</small></span><span class="card-hour"><b class="selected-time">@@HOUR@@</b> 北京时间 · 预报参考</span><span class="lcd card-grid"><span>天色 <b data-value="sky-label">@@SKY_LABEL@@</b></span><span>雨 <b data-value="rain-label">@@RAIN_LABEL@@</b></span><span>远景 <b data-value="visibility-label">@@VISIBILITY_LABEL@@</b></span><span>空气 <b><em data-value="air-label">@@AIR_LABEL@@</em><small>美国标准</small></b></span></span><span class="card-source">@@SOURCE@@</span></button>
          </div>
          <div class="bag-art bag-mid" aria-hidden="true"></div>
          <button class="planner-pull" type="button" data-peer="planner" aria-label="从背包取出拍摄计划本"><span>逐光</span><strong>拍摄<br>计划本</strong></button>
          <div class="pocket-watch">
              <header class="scene-title"><p><b class="selected-time">@@HOUR@@</b> · 这一小时的天气和光线<br><span>点击仪器查看示数及解析</span></p></header>
              <div class="watch-case">
                <div id="hour-dial" class="hour-dial" role="slider" tabindex="0" aria-label="拨针选择小时，北京时间" aria-describedby="watch-help" aria-valuemin="0" aria-valuemax="23" aria-valuenow="@@HOUR_INDEX@@" aria-valuetext="@@HOUR_READING@@">
                  <svg class="dial-marks" viewBox="0 0 240 240" aria-hidden="true"></svg>
                  <span class="watch-maker" aria-hidden="true">HIKARI FIELD<span>24 H / 021</span></span>
                  <span class="watch-hand" aria-hidden="true"></span><span class="watch-pivot" aria-hidden="true"></span>
                  <span class="watch-time selected-time" aria-hidden="true">@@HOUR@@</span>
                </div>
              </div>
              <div class="watch-actions"><button id="prev-hour" type="button" aria-label="上一小时">−1 时</button><span id="watch-help">拨针选时 · 24h</span><button id="next-hour" type="button" aria-label="下一小时">+1 时</button></div>
              <button type="button" class="text-button hour-details" data-detail="hours">24 小时明细 ↗</button>
              <div class="bag-controls">
                <div class="reading-index" aria-live="polite">@@SENTENCES@@</div>
                <div class="state-line"><span id="state-note"@@STATE_HIDDEN@@>@@STATE@@</span></div>
              </div>
            </div>
        </section>
        <div class="bag-art bag-front" id="bag-front" aria-hidden="true"></div>
        <section class="handbook" id="handbook" tabindex="-1" aria-label="当天摄影手册">
          <div class="book-shell" aria-hidden="true"><div class="shell-left"></div><div class="shell-right"></div><div class="binding"></div><div class="paper-stack paper-stack-left"></div><div class="paper-stack paper-stack-right"></div></div><div class="book-block" id="book-block"><div class="spreads" id="spreads">@@BOOK@@</div><div class="turn-leaf" id="turn-leaf" aria-hidden="true" inert><div class="leaf-front"></div><div class="leaf-back"></div></div></div>
          <div class="book-cover" id="book-cover" aria-hidden="true"><div class="cover-front"><p>逐光 · 随身丛书　01</p><h2>外拍<br>手册</h2><div class="cover-band">读懂天气<br>把判断带到现场</div><svg viewBox="0 0 300 110"><path d="M15 88H285M48 88V57H83V88M102 88V25H131V88M155 88V45H185V88M208 88V12H233V88" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="75" cy="23" r="14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 98H285" stroke="currentColor" stroke-width="1"/></svg><footer>风光 / 人像 / 街拍<br>@@LOCATION_DATE@@</footer></div><div class="cover-back"><span>逐光 · 外拍手册</span><h2>先读天空，<br>再按快门。</h2><p>今日天气，三种拍法。<br>三种题材，同一份天气。</p></div></div>
        </section>
        <div class="book-nav" id="book-nav" aria-label="手册翻页"><button type="button" id="prev-page" aria-label="上一题材">←</button><button type="button" data-genre="0">01 风光</button><button type="button" data-genre="1">02 人像</button><button type="button" data-genre="2">03 街拍</button><button type="button" id="next-page" aria-label="下一题材">→</button></div>
      </div>
      <div class="scroll-caption" id="scroll-caption" aria-hidden="true">打开摄影包 <span>↓</span></div>
    </div>
  </div>
  <section class="subscribe-section" id="subscribe" tabindex="-1" aria-labelledby="subscribe-title"><div class="intro-home"><div class="subscribe-intro"><h2 id="subscribe-title">一份简报，<br>一个出发的理由。</h2><p>未来可通过微信订阅号接收地点摘要与网页入口。<br>订阅功能正在筹备中。</p></div></div><div class="slip-home" id="slip-home"><form class="subscription" id="subscription"><header><span>逐 光 日 刊 · 订 阅 单</span><small>订阅预览</small></header><div class="form-row"><span>报刊名称</span><p>逐光日刊 · 摄影天气简报</p></div><div class="form-row"><label for="place">关注地点</label><div><input id="place" name="place" value="@@PLACE@@" required maxlength="40" autocomplete="off"></div></div><fieldset class="form-row"><legend>投递时段</legend><div><label><input type="radio" name="slot" value="07:00" checked> 晨刊 07:00</label><label><input type="radio" name="slot" value="12:00"> 午刊 12:00</label><small>北京时间 · Asia/Shanghai</small></div></fieldset><div class="form-row"><span>未来渠道</span><p>微信订阅号 / 摘要 + 对应地点网页入口</p></div><div class="form-bottom"><p>选择地点与时段，看看下一份简报的样子。</p><button type="submit" class="ink-button">预览订阅单 ↗</button></div><div class="registration" id="registration" hidden aria-live="polite"><strong class="stamp">预览单</strong><p id="registration-text"></p><button type="button" id="edit-preview">调整预览</button><button type="button" id="stop-preview">停止预览</button></div><p id="subscription-status" role="status"></p></form></div></section>
@@FULL_ADVICE@@
</main>
<footer class="site-footer"><span>逐光日刊 / HikariDaily</span><button class="text-button" type="button" data-detail="sources">数据与出处 ↗</button></footer>
<dialog id="detail" aria-labelledby="detail-title"><div class="dialog-top"><span>逐光 · 详情</span><button type="button" id="close-detail" aria-label="关闭说明">×</button></div><div id="detail-body"></div></dialog>
<dialog id="source-record" aria-labelledby="source-record-title"><div class="dialog-top"><span>逐光 · 来源详情</span><button type="button" id="close-source-record" aria-label="关闭来源详情">×</button></div><div id="source-record-body"></div></dialog>
<dialog id="hour-detail" aria-labelledby="hour-detail-title"><div class="dialog-top"><span>逐光 · 小时说明</span><button type="button" id="close-hour-detail" aria-label="关闭小时说明">×</button></div><div id="hour-detail-body" class="dialog-content"></div></dialog>
`;
