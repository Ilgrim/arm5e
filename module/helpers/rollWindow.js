import { ARM5E } from "../config.js";
import { simpleDie, stressDie, noRoll, changeMight, useItemCharge } from "../dice.js";
import { PickRequisites, checkTargetAndCalculateResistance, noFatigue } from "./magic.js";
import { chatFailedCasting } from "./chat.js";
import { ArM5ePCActor } from "../actor/actor.js";
import {
  setAgingEffects,
  agingCrisis,
  twilightControl,
  applyTwilightStrength,
  resetTwilight,
  TWILIGHT_STAGES,
  applyTwilightComplexity,
  twilightUnderstanding
} from "./long-term-activities.js";
import { exertSelf } from "./combat.js";
import { getDataset, log } from "../tools.js";
import { ArM5eItem } from "../item/item.js";

// below is a bitmap
const ROLL_MODES = {
  NONE: 0, // can be used with dataset to customize dynamically
  STRESS: 1,
  SIMPLE: 2,
  NO_BOTCH: 4,
  NO_CONF: 8, // No confidence use
  UNCONSCIOUS: 16, // Can roll unconscious
  PRIVATE: 32, // Roll is private between the GM and player
  // common combos
  STRESS_OR_SIMPLE: 3
};

const ROLL_MODIFIERS = {
  PHYSICAL: 1,
  ENCUMBRANCE: 2,
  AURA: 4
};

const ROLL_PROPERTIES = {
  OPTION: {
    VAL: "option",
    MODE: ROLL_MODES.STRESS_OR_SIMPLE,
    MODIFIERS: 1,
    TITLE: "arm5e.dialog.title.rolldie"
  },
  ABILITY: {
    VAL: "ability",
    MODE: ROLL_MODES.STRESS_OR_SIMPLE,
    MODIFIERS: 1,
    TITLE: "arm5e.dialog.title.rolldie"
  },
  // COMBAT: {
  //   MODE: ROLL_MODES.STRESS,
  //   TITLE: "arm5e.dialog.title.rolldie",
  //   MODIFIERS: 1,
  //   // ALTER_ROLL: doubleAbility,
  //   ALT_ACTION: exertSelf,
  //   ALT_ACTION_LABEL: "arm5e.dialog.button.exertSelf"
  // },
  ATTACK: {
    VAL: "attack",
    MODE: ROLL_MODES.STRESS,
    TITLE: "arm5e.dialog.title.rolldie",
    MODIFIERS: 1,
    // ALTER_ROLL: doubleAbility,
    ALT_ACTION: exertSelf,
    ALT_ACTION_LABEL: "arm5e.dialog.button.exertSelf"
  },
  DEFENSE: {
    VAL: "defense",
    MODE: ROLL_MODES.STRESS,
    TITLE: "arm5e.dialog.title.rolldie",
    MODIFIERS: 1,
    // ALTER_ROLL: doubleAbility,
    ALT_ACTION: exertSelf,
    ALT_ACTION_LABEL: "arm5e.dialog.button.exertSelf"
  },
  INIT: {
    VAL: "init",
    MODE: ROLL_MODES.STRESS,
    MODIFIERS: 3,
    TITLE: "arm5e.dialog.title.rolldie"
  },
  MAGIC: {
    VAL: "magic",
    MODE: ROLL_MODES.STRESS,
    MODIFIERS: 7,
    TITLE: "arm5e.dialog.title.rolldie",
    CALLBACK: castSpell,
    ALTER_ROLL: noFatigue,
    ALT_ACTION: noRoll,
    ALT_ACTION_LABEL: "arm5e.dialog.button.noroll"
  },
  SPONT: {
    VAL: "spont",
    MODE: ROLL_MODES.STRESS,
    MODIFIERS: 7,
    TITLE: "arm5e.dialog.title.rolldie",
    CALLBACK: castSpell,
    ALTER_ROLL: noFatigue,
    ALT_ACTION: noRoll,
    ALT_ACTION_LABEL: "arm5e.dialog.button.noroll"
  },
  CHAR: {
    VAL: "char",
    MODE: 19, // STRESS + SIMPLE + UNCONSCIOUS
    MODIFIERS: 1,
    TITLE: "arm5e.dialog.title.rolldie"
  },
  SPELL: {
    VAL: "spell",
    MODE: ROLL_MODES.STRESS_OR_SIMPLE,
    MODIFIERS: 7,
    TITLE: "arm5e.dialog.title.rolldie",
    CALLBACK: castSpell
  },
  AGING: {
    VAL: "aging",
    MODE: 61, // STRESS + NO_BOTCH + NO_CONF + UNCONSCIOUS + PRIVATE
    MODIFIERS: 0,
    TITLE: "arm5e.aging.roll.label",
    CALLBACK: setAgingEffects,
    ALTER_ROLL: noFatigue
  },
  TWILIGHT_CONTROL: {
    VAL: "twilight_control",
    MODE: 25, // STRESS  + NO_CONF + UNCONSCIOUS
    MODIFIERS: 1,
    TITLE: "arm5e.twilight.episode",
    ACTION_LABEL: "arm5e.twilight.control.avoid",
    CALLBACK: twilightControl
  },
  TWILIGHT_STRENGTH: {
    VAL: "twilight_strength",
    MODE: 61, // STRESS + NO_BOTCH + NO_CONF + UNCONSCIOUS + PRIVATE
    MODIFIERS: 0,
    TITLE: "arm5e.twilight.episode",
    CALLBACK: applyTwilightStrength
  },
  TWILIGHT_COMPLEXITY: {
    VAL: "twilight_complexity",
    MODE: 57, // STRESS + NO_CONF + UNCONSCIOUS + PRIVATE
    MODIFIERS: 0,
    TITLE: "arm5e.twilight.episode",
    CALLBACK: applyTwilightComplexity
  },
  TWILIGHT_UNDERSTANDING: {
    VAL: "twilight_understanding",
    MODE: 25, // STRESS  + NO_CONF + UNCONSCIOUS
    MODIFIERS: 1,
    TITLE: "arm5e.twilight.episode",
    CALLBACK: twilightUnderstanding
  },
  CRISIS: {
    VAL: "crisis",
    MODE: 58, // SIMPLE + NO_CONF + UNCONSCIOUS + PRIVATE
    MODIFIERS: 0,
    TITLE: "arm5e.aging.crisis.label",
    CALLBACK: agingCrisis
  },
  SUPERNATURAL: {
    VAL: "supernatural",
    MODE: ROLL_MODES.NONE, // use dataset.dieType
    MODIFIERS: 7,
    TITLE: "arm5e.dialog.title.rolldie",
    ACTION_LABEL: "arm5e.dialog.powerUse",
    CALLBACK: castSupernaturalEffect
  }
};

/**
 *
 * @param type
 */
function getRollTypeProperties(type) {
  return ROLL_PROPERTIES[type.toUpperCase()] ?? ROLL_PROPERTIES.OPTION;
}

/**
 *
 * @param dataset
 * @param actor
 */
function prepareRollVariables(dataset, actor) {
  actor.rollInfo.init(dataset, actor);
  // Log(false, `Roll data: ${JSON.stringify(actor.rollInfo)}`);
}

/**
 *
 * @param dataset
 */
function chooseTemplate(dataset) {
  if (
    [
      ROLL_PROPERTIES.ATTACK.VAL,
      ROLL_PROPERTIES.DEFENSE.VAL,
      ROLL_PROPERTIES.INIT.VAL,
      ROLL_PROPERTIES.OPTION.VAL
    ].includes(dataset.roll)
  ) {
    return "systems/arm5e/templates/roll/roll-options.html";
  }
  if ([ROLL_PROPERTIES.CHAR.VAL, ROLL_PROPERTIES.ABILITY.VAL].includes(dataset.roll)) {
    return "systems/arm5e/templates/roll/roll-characteristic.html";
  }
  if (dataset.roll == ROLL_PROPERTIES.SPONT.VAL) {
    // Spontaneous magic
    return "systems/arm5e/templates/roll/roll-magic.html";
  }
  if ([ROLL_PROPERTIES.MAGIC.VAL, ROLL_PROPERTIES.SPELL.VAL].includes(dataset.roll)) {
    return "systems/arm5e/templates/roll/roll-spell.html";
  }
  if (dataset.roll == ROLL_PROPERTIES.SUPERNATURAL.VAL) {
    return "systems/arm5e/templates/roll/roll-supernatural.html";
  }
  if (dataset.roll == ROLL_PROPERTIES.AGING.VAL) {
    // Aging roll
    return "systems/arm5e/templates/roll/roll-aging.html";
  }
  if (dataset.roll == ROLL_PROPERTIES.CRISIS.VAL) {
    // Aging crisis roll
    return "systems/arm5e/templates/roll/roll-aging-crisis.html";
  }

  if (dataset.roll == ROLL_PROPERTIES.TWILIGHT_CONTROL.VAL) {
    return "systems/arm5e/templates/roll/roll-twilightControl.html";
  }
  if (dataset.roll == ROLL_PROPERTIES.TWILIGHT_STRENGTH.VAL) {
    return "systems/arm5e/templates/roll/roll-twilightStrength.html";
  }
  if (dataset.roll == ROLL_PROPERTIES.TWILIGHT_COMPLEXITY.VAL) {
    return "systems/arm5e/templates/roll/roll-twilightComplexity.html";
  }
  if (dataset.roll == ROLL_PROPERTIES.TWILIGHT_UNDERSTANDING.VAL) {
    return "systems/arm5e/templates/roll/roll-twilightUnderstanding.html";
  }
  return "";
}

/**
 *
 * @param dataset
 * @param actor
 */
function updateCharacteristicDependingOnRoll(dataset, actor) {
  if (
    [ROLL_PROPERTIES.SPONT.VAL, ROLL_PROPERTIES.MAGIC.VAL, ROLL_PROPERTIES.SPELL.VAL].includes(
      dataset.roll
    )
  ) {
    actor.rollInfo.characteristic = "sta";
  }
}

/**
 *
 * @param actor
 * @param callback
 */
function getDebugButtonsIfNeeded(actor, callback) {
  if (!game.modules.get("_dev-mode")?.api?.getPackageDebugValue(ARM5E.SYSTEM_ID)) return {};
  return {
    explode: {
      label: "DEV Roll 1",
      callback: async (html) => {
        actor = getFormData(html, actor);
        await stressDie(actor, actor.rollInfo.type, 1, callback, actor.rollInfo.botchNumber);
      }
    },
    zero: {
      label: "DEV Roll 0",
      callback: async (html) => {
        actor = getFormData(html, actor);
        await stressDie(actor, actor.rollInfo.type, 2, callback, actor.rollInfo.botchNumber);
      }
    }
  };
}

/**
 *
 * @param dataset
 * @param html
 * @param actor
 */
function getDialogData(dataset, html, actor) {
  const callback = getRollTypeProperties(dataset.roll).CALLBACK;

  let btns = {};
  let mode = 0;
  const altAction = getRollTypeProperties(dataset.roll).ALT_ACTION;
  let altBtn;
  if (altAction) {
    const btnLabel = getRollTypeProperties(dataset.roll).ALT_ACTION_LABEL;
    const rollAlteration = getRollTypeProperties(dataset.roll).ALTER_ROLL;
    altBtn = {
      icon: "<i class='fas fa-check'></i>",
      label: game.i18n.localize(btnLabel),
      callback: async (html) => {
        actor = getFormData(html, actor);
        if (rollAlteration) {
          rollAlteration(actor);
        }
        await altAction(actor, mode, callback);
      }
    };
  }
  const properties = getRollTypeProperties(dataset.roll);
  const title = properties.TITLE;
  if (properties.MODE & ROLL_MODES.STRESS || ROLL_MODES[dataset.dieType] & ROLL_MODES.STRESS) {
    if (properties.MODE & ROLL_MODES.NO_BOTCH) {
      mode = 4; // No botches
    }

    btns.yes = {
      icon: "<i class='fas fa-check'></i>",
      label: game.i18n.localize(
        properties.ACTION_LABEL ? properties.ACTION_LABEL : "arm5e.dialog.button.stressdie"
      ),
      callback: async (html) => {
        actor = getFormData(html, actor);
        await stressDie(actor, dataset.roll, mode, callback, actor.rollInfo.botchNumber);
      }
    };
    if (altAction) {
      btns.alt = altBtn;
    }
    if (properties.MODE & ROLL_MODES.SIMPLE || ROLL_MODES[dataset.dieType] & ROLL_MODES.SIMPLE) {
      btns.no = {
        icon: "<i class='fas fa-check'></i>",
        label: game.i18n.localize(
          properties.ACTION_LABEL ? properties.ACTION_LABEL : "arm5e.dialog.button.simpledie"
        ),
        callback: async (html) => {
          actor = getFormData(html, actor);
          await simpleDie(actor, dataset.roll, callback);
        }
      };
    } else {
      btns.no = {
        icon: "<i class='fas fa-ban'></i>",
        label: game.i18n.localize("arm5e.dialog.button.cancel"),
        callback: async (html) => {
          await actor.rollInfo.reset();
        }
      };
    }
  } else if (
    properties.MODE & ROLL_MODES.SIMPLE ||
    ROLL_MODES[dataset.dieType] & ROLL_MODES.SIMPLE
  ) {
    // Simple die only
    btns.yes = {
      icon: "<i class='fas fa-check'></i>",
      label: game.i18n.localize(
        properties.ACTION_LABEL ? properties.ACTION_LABEL : "arm5e.dialog.button.simpledie"
      ),
      callback: async (html) => {
        actor = getFormData(html, actor);
        await simpleDie(actor, dataset.roll, callback);
      }
    };
    if (altAction) {
      btns.alt = altBtn;
    }
    btns.no = {
      icon: "<i class='fas fa-ban'></i>",
      label: game.i18n.localize("arm5e.dialog.button.cancel"),
      callback: async (html) => {
        await actor.rollInfo.reset();
      }
    };
  } else {
    //no roll
    btns.yes = {
      icon: "<i class='fas fa-check'></i>",
      label: game.i18n.localize(
        properties.ACTION_LABEL ? properties.ACTION_LABEL : "arm5e.dialog.powerUse"
      ),
      callback: async (html) => {
        actor = getFormData(html, actor);
        await noRoll(actor, 1, null);
      }
    };
    btns.no = {
      icon: "<i class='fas fa-ban'></i>",
      label: game.i18n.localize("arm5e.dialog.button.cancel"),
      callback: null
    };
  }
  return {
    title: game.i18n.localize(title),
    content: html,
    render: addListenersDialog,
    buttons: {
      ...btns
      // ...getDebugButtonsIfNeeded(actor, callback)
    }
  };
}

/**
 *
 * @param dataset
 * @param item
 */
async function useMagicItem(dataset, item) {
  if (item.system.enchantments.charges == 0) {
    ui.notifications.warn(game.i18n.localize("arm5e.notification.noChargesLeft"));
    return;
  }

  prepareRollVariables(dataset, item.actor);
  log(false, `Roll variables: ${JSON.stringify(item.actor.system.roll)}`);
  let template = "systems/arm5e/templates/actor/parts/actor-itemUse.html";
  item.actor.system.roll = item.actor.rollInfo;
  item.actor.config = CONFIG.ARM5E;
  const renderedTemplate = await renderTemplate(template, item.actor);

  const dialog = new Dialog(
    {
      title: game.i18n.localize("arm5e.dialog.magicItemUse"),
      content: renderedTemplate,
      render: addListenersDialog,
      buttons: {
        yes: {
          icon: "<i class='fas fa-check'></i>",
          label: game.i18n.localize("arm5e.dialog.magicItemUse"),
          callback: async (html) => {
            getFormData(html, item.actor);
            await noRoll(item.actor, 1, useItemCharge);
          }
        },
        no: {
          icon: "<i class='fas fa-ban'></i>",
          label: game.i18n.localize("arm5e.dialog.button.cancel"),
          callback: null
        }
      }
    },
    {
      jQuery: true,
      height: "600px",
      width: "400px",
      classes: ["roll-dialog", "arm5e-dialog", "dialog"]
    }
  );
  dialog.render(true);
}

/**
 *
 * @param dataset
 * @param actor
 */
async function usePower(dataset, actor) {
  if (Number(dataset.cost) > actor.system.might.points) {
    ui.notifications.warn(game.i18n.localize("arm5e.notification.noMightPoints"));
    return;
  }

  prepareRollVariables(dataset, actor);
  log(false, `Roll variables: ${JSON.stringify(actor.system.roll)}`);
  let template = "systems/arm5e/templates/actor/parts/actor-powerUse.html";
  actor.system.roll = actor.rollInfo;
  const renderedTemplate = await renderTemplate(template, actor);

  const dialog = new Dialog(
    {
      title: dataset.name,
      content: renderedTemplate,
      render: addListenersDialog,
      buttons: {
        yes: {
          icon: "<i class='fas fa-check'></i>",
          label: game.i18n.localize("arm5e.dialog.powerUse"),
          callback: async (html) => {
            actor = getFormData(html, actor);
            if (actor.system.features.hasMight) {
              await noRoll(actor, 1, changeMight);
            } else {
              await noRoll(actor, 1, actor.loseFatigueLevel);
            }
          }
        },
        no: {
          icon: "<i class='fas fa-ban'></i>",
          label: game.i18n.localize("arm5e.dialog.button.cancel"),
          callback: null
        }
      }
    },
    {
      jQuery: true,
      height: "600px",
      width: "400px",
      classes: ["roll-dialog", "arm5e-dialog", "dialog"]
    }
  );
  dialog.render(true);
}
/**
 *
 * @param html
 */
function addListenersDialog(html) {
  html.find(".clickable").click((ev) => {
    $(ev.currentTarget).next().toggleClass("hide");
  });

  html.find(".resource-focus").focus((ev) => {
    ev.preventDefault();
    ev.currentTarget.select();
  });

  html.find(".advanced-req-roll").click(async (e) => {
    const dataset = getDataset(e);
    const actor = game.actors.get(dataset.actorid);
    const item = actor.items.get(dataset.itemid);
    // Create a tmp Item in memory
    let newSpell = new ArM5eItem(item.toObject(), { temporary: true });
    let update = await PickRequisites(newSpell.system, dataset.flavor);
    await newSpell.updateSource(update);
    let techData = newSpell._getTechniqueData(actor.system);
    actor.rollInfo.magic.technique.label = techData[0];
    actor.rollInfo.magic.technique.score = techData[1];
    actor.rollInfo.magic.technique.deficiency = techData[2];
    let formData = newSpell._getFormData(actor.system);
    actor.rollInfo.magic.form.label = formData[0];
    actor.rollInfo.magic.form.score = formData[1];
    actor.rollInfo.magic.form.deficiency = formData[2];
  });

  html.find(".voice-and-gestures").change(async (event) => {
    const dataset = getDataset(event);
    const actor = game.actors.get(dataset.actorid);
    const name = $(event.target).attr("effect");
    await actor.selectVoiceAndGestures(name, $(event.target).val());
  });
}

/**
 *
 * @param dataset
 * @param template
 * @param actor
 */
async function renderRollTemplate(dataset, template, actor) {
  if (!template) {
    return;
  }
  actor.system.roll = actor.rollInfo;
  actor.config = CONFIG.ARM5E;
  actor.selection = actor.rollInfo.selection;
  const renderedTemplate = await renderTemplate(template, actor);
  const dialogData = getDialogData(dataset, renderedTemplate, actor);
  const dialog = new Dialog(
    {
      ...dialogData,
      render: addListenersDialog
    },
    {
      classes: ["arm5e-dialog", "dialog"],
      height: "780px",
      width: "400px"
    }
  );
  dialog.render(true);
  return dialog;
}

/**
 *
 * @param actorCaster
 * @param roll
 * @param message
 */
async function castSpell(actorCaster, roll, message) {
  // First check that the spell succeeds
  const levelOfSpell = actorCaster.rollInfo.magic.level;
  const totalOfSpell = Math.round(roll._total);

  if (roll.botches > 0) {
    const updateData = {};
    if (roll.botches >= actorCaster.system.bonuses.art.warpingThreshold) {
      // twilight pending
      updateData["system.twilight.pointsGained"] = roll.botches;
      updateData["system.twilight.stage"] = TWILIGHT_STAGES.PENDING_STRENGTH;
      updateData["system.twilight.year"] = actorCaster.rollInfo.environment.year;
      updateData["system.twilight.season"] = actorCaster.rollInfo.environment.season;
    }
    updateData["system.warping.points"] = actorCaster.system.warping.points + roll.botches;
    await actorCaster.update(updateData);
  }
  if (actorCaster.rollInfo.type == "spell") {
    const delta = totalOfSpell - levelOfSpell;

    let fatigue = 0;
    if (actorCaster.rollInfo.magic.ritual) {
      if (delta < 0) {
        fatigue = Math.max(
          1 +
            Math.ceil((levelOfSpell - totalOfSpell) / 5) -
            actorCaster.system.bonuses.arts.ritualFatigueCancelled,
          0
        );
      } else {
        fatigue = Math.max(1 - actorCaster.system.bonuses.arts.ritualFatigueCancelled, 0);
      }
    } else {
      if (delta < -actorCaster.system.bonuses.arts.spellFatigueThreshold) {
        fatigue = 1;
      }
    }
    // Lose fatigue levels
    await actorCaster.loseFatigueLevel(fatigue);
    if (delta < -10) {
      await chatFailedCasting(actorCaster, roll, message, fatigue);
      return false;
    }

    // Uncomment when A-A integration is ready
    // let data = {
    //   itemId: actorCaster.rollInfo.itemId,
    //   targets: game.user.targets,
    //   actorId: actorCaster._id
    // };

    // Hooks.callAll("arm5e:spellcasting", data, {user : game.user.id});
  } else {
    log(false, `Casting total: ${totalOfSpell}`);
    // Magic effect
    if (totalOfSpell < levelOfSpell) {
      await chatFailedCasting(actorCaster, roll, message, 0);
      return false;
    }
  }
  // Then do contest of magic
  await checkTargetAndCalculateResistance(actorCaster, roll, message);
}

/**
 *
 * @param actorCaster
 * @param roll
 * @param message
 */
async function castSupernaturalEffect(actorCaster, roll, message) {
  // First check that the spell succeeds
  const levelOfSpell = actorCaster.rollInfo.magic.level;
  const totalOfSpell = Math.round(roll._total);

  if (roll.botches > 0) {
    const updateData = {};
    if (roll.botches >= actorCaster.system.bonuses.art.warpingThreshold) {
      // twilight pending
      updateData["system.twilight.pointsGained"] = roll.botches;
      updateData["system.twilight.stage"] = 1;
      updateData["system.twilight.year"] = actorCaster.rollInfo.environment.year;
      updateData["system.twilight.season"] = actorCaster.rollInfo.environment.season;
    }
    updateData["system.warping.points"] = actorCaster.system.warping.points + roll.botches;
    await actorCaster.update(updateData);
  }

  log(false, `Casting total: ${totalOfSpell}`);
  // Magic effect
  if (totalOfSpell < levelOfSpell) {
    await chatFailedCasting(actorCaster, roll, message, 0);
    return false;
  }
  // Then do contest of magic
  await checkTargetAndCalculateResistance(actorCaster, roll, message);
}

/**
 *
 * @param html
 * @param actor
 */
export function getFormData(html, actor) {
  let find = html.find(".SelectedCharacteristic");
  if (find.length > 0) {
    actor.rollInfo.characteristic = find[0].value;
  }
  find = html.find(".SelectedAbility");
  if (find.length > 0) {
    if (find[0].value == "None") {
      const dataset = {
        name: actor.rollInfo.name,
        roll: "char",
        characteristic: actor.rollInfo.characteristic,
        modifier: actor.rollInfo.modifier
      };
      actor.rollInfo.init(dataset, actor);
      // Actor.rollInfo.ability.score = 0;
      // actor.rollInfo.ability.name = "";
      // actor.rollInfo.type = "char";
    } else {
      const dataset = {
        name: actor.rollInfo.name,
        roll: "ability",
        ability: find[0].value,
        defaultcharacteristic: actor.rollInfo.characteristic,
        modifier: actor.rollInfo.modifier
      };
      actor.rollInfo.init(dataset, actor);

      // Const ability = actor.items.get(find[0].value);
      // actor.rollInfo.ability.score = ability.system.finalScore;
      // actor.rollInfo.ability.name = ability.name;
      // actor.rollInfo.type = "ability";
    }
  }

  find = html.find(".abilitySpeciality");
  if (find.length > 0) {
    actor.rollInfo.ability.specApply = find[0].checked;
  }

  find = html.find(".enigmaSpeciality");
  if (find.length > 0) {
    actor.rollInfo.twilight.enigma.specApply = find[0].checked;
  }

  find = html.find(".SelectedTechnique");
  if (find.length > 0) {
    actor.rollInfo.magic.technique.value = find[0].value;
    actor.rollInfo.magic.technique.label = ARM5E.magic.techniques[find[0].value].label;
    actor.rollInfo.magic.technique.score = parseInt(
      actor.system.arts.techniques[find[0].value].finalScore
    );

    if (actor.system.arts.techniques[find[0].value].deficient) {
      actor.rollInfo.magic.technique.deficiency = true;
    } else {
      actor.rollInfo.magic.technique.deficiency = false;
    }
  }

  find = html.find(".SelectedForm");
  if (find.length > 0) {
    actor.rollInfo.magic.form.value = find[0].value;
    actor.rollInfo.magic.form.label = ARM5E.magic.forms[find[0].value].label;
    actor.rollInfo.magic.form.score = parseInt(actor.system.arts.forms[find[0].value].finalScore);
    if (actor.system.arts.forms[find[0].value].deficient) {
      actor.rollInfo.magic.form.deficiency = true;
    } else {
      actor.rollInfo.magic.form.deficiency = false;
    }
  }

  find = html.find(".SelectedAura");
  if (find.length > 0) {
    actor.rollInfo.environment.aura.modifier = Number(find[0].value) ?? 0;
  }

  find = html.find(".SelectedLevel");
  if (find.length > 0) {
    actor.rollInfo.magic.level = Number(find[0].value) ?? 0;
  }

  find = html.find(".SelectedModifier");
  if (find.length > 0) {
    actor.rollInfo.modifier = Number(find[0].value) ?? 0;
    // Negative modifier
    if ([ROLL_PROPERTIES.CRISIS.VAL].includes(actor.rollInfo.type)) {
      actor.rollInfo.modifier = -actor.rollInfo.modifier;
    }
  }

  find = html.find(".SelectedAdvantage");
  if (find.length > 0) {
    actor.rollInfo.combat.advantage = Number(find[0].value) ?? 0;
  }

  find = html.find(".SelectedWarpingPoints");
  if (find.length > 0) {
    actor.rollInfo.twilight.warpingPts = Number(find[0].value) ?? 2;
  }

  find = html.find(".SelectedFocus");
  if (find.length > 0) {
    actor.rollInfo.magic.focus = find[0].checked;
  }

  find = html.find(".SelectedYear");
  if (find.length > 0) {
    actor.rollInfo.environment.year = Number(find[0].value) ?? 1220;
  }

  if (
    [ROLL_PROPERTIES.SPONT.VAL, ROLL_PROPERTIES.MAGIC.VAL, ROLL_PROPERTIES.SPELL.VAL].includes(
      actor.rollInfo.type
    ) ||
    actor.rollInfo.type == "power"
  ) {
    find = html.find(".penSpeciality");
    if (find.length > 0) {
      actor.rollInfo.penetration.specApply = find[0].checked;
    }
    find = html.find(".spellMastery");
    if (find.length > 0) {
      actor.rollInfo.penetration.penetrationMastery = find[0].checked;
    }
    find = html.find(".multiplierBonusArcanic");
    if (find.length > 0) {
      actor.rollInfo.penetration.multiplierBonusArcanic = Number(find[0].value) ?? 0;
    }

    find = html.find(".multiplierBonusSympathic");
    if (find.length > 0) {
      actor.rollInfo.penetration.multiplierBonusSympathic = Number(find[0].value) ?? 0;
    }
  }
  let idx = 0;
  for (let optEffect of actor.rollInfo.optionalBonuses) {
    find = html.find(`.SelectedOptional${idx}`);
    if (find.length > 0) {
      actor.rollInfo.optionalBonuses[idx].active = find[0].checked;
    }
    idx++;
  }

  return actor;
}

export {
  chooseTemplate,
  updateCharacteristicDependingOnRoll,
  renderRollTemplate,
  prepareRollVariables,
  ROLL_MODES,
  ROLL_MODIFIERS,
  ROLL_PROPERTIES,
  getRollTypeProperties,
  usePower,
  useMagicItem
};
