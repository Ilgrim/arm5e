import { debug, log } from "../tools.js";
import { ArM5eItemSheetNoDesc } from "./item-sheet.js";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class ArM5eSmallSheet extends ArM5eItemSheetNoDesc {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["arm5e", "sheet", "item"],
      width: 400,
      height: 602
    });
  }

  /** @override */
  async getData() {
    const context = await super.getData();

    context;
    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".change-gravity").change(async (event) => this._changeGravity(this.item, event));
  }

  async _changeGravity(item, event) {
    event.preventDefault();
    await this.item._updateIcon("system.gravity", event.target.value);
  }
}
