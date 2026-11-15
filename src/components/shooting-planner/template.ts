export const plannerHtml = `<div class="planner-app">  <main class="workspace" aria-label="拍摄计划本">
    <div class="book-viewport" id="book-viewport">
      <div class="book-scene" id="book-scene">
        <div class="book-actions">
          <button class="quiet-button back-to-index" id="back-button">← 回到目录</button>
        </div>
        <div class="book" id="book">
          <div class="book-board" aria-hidden="true"></div>
          <div class="page-edges" aria-hidden="true"></div>
          <div class="spread" id="spread"></div>
          <div class="binding" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <nav class="section-tabs" id="section-tabs" aria-label="计划栏目"></nav>
          <div class="ribbon" aria-hidden="true"></div>
        </div>
        <div class="cover" id="cover" hidden>
          <button id="open-book" aria-label="打开拍摄计划本，查看目录">
            <span class="cover-imprint">逐光</span>
            <span class="cover-title">拍摄计划本</span>
            <span class="cover-year">2026</span>
            <span class="cover-open">打开计划本 →</span>
          </button>
        </div>
        <footer class="book-footer">
          <button class="quiet-button" id="thumb-toggle" aria-expanded="false">▦ 页览</button>
          <div class="page-navigation"><button id="previous-page" aria-label="上一对页">←</button><span id="page-counter">目录</span><button id="next-page" aria-label="下一对页">→</button></div>
        </footer>
        <div class="thumbnail-strip" id="thumbnail-strip" hidden aria-label="页面缩略图"></div>
      </div>
    </div>
  </main>


  <div class="toast" id="toast" role="status" hidden></div>
  <input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp" multiple hidden>

  <dialog class="writing-dialog" id="writing-dialog">
    <form id="writing-form">
      <div class="dialog-heading"><div><span class="eyebrow">新建计划</span><h2 id="writing-title">写下拍摄想法</h2></div><button type="button" class="icon-button" id="writing-cancel" aria-label="取消书写">×</button></div>
      <div id="writing-fields"></div>
      <div class="writing-bottom"><span>创建后可直接在纸页上填写</span><button class="primary-button" type="submit">创建计划</button></div>
    </form>
  </dialog>

  <dialog class="annotation-dialog" id="annotation-dialog">
    <div class="annotation-heading"><div><span class="eyebrow">单图批注</span><h2 id="annotation-title">参考图</h2></div><button id="annotation-cancel" class="quiet-button">取消</button><button id="annotation-done" class="primary-button">完成</button></div>
    <div class="annotation-workspace">
      <div class="annotation-stage">
        <div class="annotation-image-wrap" id="annotation-image-wrap">
          <aside class="annotation-tools" aria-label="批注工具">
            <button class="selected" data-tool="pen">画笔</button>
            <button data-tool="arrow">箭头</button>
            <button data-tool="text">文字</button>
            <button data-tool="rectangle">框选</button>
            <button data-tool="crop">裁剪</button>
            <button id="annotation-rotate">旋转</button>
            <button id="annotation-uncrop">恢复全图</button>
            <span aria-hidden="true"></span>
            <button id="annotation-undo" aria-label="撤销批注">↶</button>
            <button id="annotation-redo" aria-label="重做批注">↷</button>
            <input id="annotation-color" type="color" value="#9c5c43" aria-label="批注颜色">
            <button id="annotation-clear">清空</button>
          </aside>
          <img id="annotation-image" alt="正在批注的原图">
          <canvas id="annotation-canvas" aria-label="在图片上绘制批注"></canvas>
        </div>
      </div>
    </div>
    <div class="annotation-foot"><span id="annotation-hint">按住并拖动画笔</span><span>完成后返回原书页</span></div>
    <div class="annotation-text-entry" id="annotation-text-entry" hidden><label>批注文字<input id="annotation-text" maxlength="100" placeholder="例如：人物站在这里"></label><button id="annotation-text-add" class="primary-button">写入图片</button></div>
  </dialog>

  <dialog class="small-dialog" id="confirm-dialog"><h2 id="confirm-title">移入回收夹</h2><p id="confirm-copy"></p><div class="dialog-buttons"><button id="confirm-cancel" class="quiet-button">保留</button><button id="confirm-done" class="primary-button">移入回收夹</button></div></dialog>

  <dialog class="small-dialog" id="manage-dialog" aria-label="管理计划"><h2>管理计划</h2><label class="writing-field"><span>计划名称</span><input id="manage-title" maxlength="1000"></label><label class="writing-field"><span>拍摄状态</span><select id="manage-status"><option value="draft">草稿</option><option value="planned">待拍</option><option value="done">已拍</option></select></label><div class="dialog-buttons"><button id="manage-copy">复制计划</button><button id="manage-delete">移入回收夹</button><button id="manage-close">取消</button><button id="manage-save">保存</button></div></dialog>
  <textarea class="inline-field text-lines measure-page" id="measure-page" rows="1" tabindex="-1" aria-hidden="true"></textarea>
<dialog class="writing-dialog" id="reference-dialog" aria-label="收进拍摄计划"><div class="dialog-heading"><h2>收进拍摄计划</h2><button data-reference-close>取消</button></div><div id="reference-choices"></div></dialog><dialog class="small-dialog" id="break-dialog" aria-label="分页"><h2>从光标处开始新页</h2><p>按 ⌘ / Ctrl + Enter 可插入或取消手动分页。</p><div class="dialog-buttons"><button id="break-cancel">取消</button><button id="break-apply">插入 / 取消分页</button></div></dialog></div>`;
