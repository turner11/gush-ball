// jsdom has no showModal()/close(); mimic the browser, which fires `close` after Esc or close().
HTMLDialogElement.prototype.showModal ??= function () {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close ??= function () {
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}
