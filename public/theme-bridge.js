(() => {
  "use strict";

  const root = document.documentElement;
  const palettes = {
    y2k: ["#ff78d2", "#70f4ff", "#5656a8"],
    pastel: ["#F4B8D8", "#B8E8E0", "#8B80B8"],
    lavender: ["#DCCBFF", "#B9D5FF", "#8272B8"],
    peach: ["#FFC9B9", "#FFE2A9", "#B86E72"],
    mint: ["#BDEFD9", "#D5F4C7", "#5B9C88"],
    "baby-pink": ["#F8C8DC", "#FFE3EE", "#B86D91"],
    ocean: ["#65cfff", "#8fffe0", "#245b9b"],
    sunset: ["#ff986b", "#ffd166", "#9a3d7a"],
    lime: ["#c4ff5e", "#62ffd3", "#416b68"],
    mono: ["#f0f0f0", "#aeb8c7", "#626c7b"],
    aero: ["#36c9e4", "#b1fff0", "#087fb5"],
    classic: ["#000080", "#c0c0c0", "#008080"],
    kodoku: ["#ffffff", "#d8d8d8", "#777777"],
    tsimiomi: ["#ff3324", "#d7d7d7", "#7d0505"]
  };
  const fonts = ["Trebuchet MS", "Arial", "Verdana", "Georgia", "Courier New", "Tahoma", "system-ui"];

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || "{}"); }
    catch (_) { return {}; }
  }

  function apply(settings) {
    const saved = settings && typeof settings === "object" ? settings : read("junto_theme");
    const name = Object.prototype.hasOwnProperty.call(palettes, saved.name) || saved.name === "custom"
      ? saved.name
      : "y2k";
    let colors = palettes[name] || palettes.y2k;
    if (name === "custom") {
      const custom = /^#[0-9a-f]{6}$/i.test(saved.color || "") ? saved.color : "#ff78d2";
      colors = [custom, custom, "#252447"];
    }

    const options = read("junto_options");
    const font = fonts.includes(options.font) ? options.font : "Trebuchet MS";
    let page, panel, surface, soft, text, muted, border, buttonText, scene;

    if (name === "classic") {
      page = "#167bd1";
      panel = "#f7fbff";
      surface = "#ffffff";
      soft = "#e1efff";
      text = "#18345b";
      muted = "#45698e";
      border = "#7fafe0";
      buttonText = "#ffffff";
      scene = "radial-gradient(ellipse at 50% 48%, #d9efff 0%, #8dc5ee 58%, #4c91ca 100%)";
    } else if (name === "aero") {
      page = "#06334f";
      panel = "#073e60";
      surface = "#0a4b6d";
      soft = "#0a3858";
      text = "#f1ffff";
      muted = "#b9e7f2";
      border = "#62dced";
      buttonText = "#064267";
      scene = "radial-gradient(ellipse at 50% 48%, #1b82a3 0%, #075274 62%, #042a49 100%)";
    } else if (name === "kodoku") {
      page = "#101010";
      panel = "#202020";
      surface = "#292929";
      soft = "#181818";
      text = "#f2f2f2";
      muted = "#b9b9b9";
      border = "#777777";
      buttonText = "#171717";
      scene = "radial-gradient(ellipse at 50% 48%, #444 0%, #202020 68%, #0b0b0b 100%)";
    } else if (name === "mono") {
      page = "#171b22";
      panel = "#242a34";
      surface = "#303844";
      soft = "#202630";
      text = "#f1f3f6";
      muted = "#b7c0cb";
      border = "#8995a5";
      buttonText = "#252a32";
      scene = "radial-gradient(ellipse at 50% 48%, #555f6d 0%, #303844 68%, #171b22 100%)";
    } else if (name === "tsimiomi") {
      page = "#260907";
      panel = "#3a100e";
      surface = "#501512";
      soft = "#2e0b09";
      text = "#fff0ed";
      muted = "#e0b8b3";
      border = "#c34438";
      buttonText = "#260907";
      scene = "radial-gradient(ellipse at 50% 48%, #7b2019 0%, #3d100d 68%, #190605 100%)";
    } else {
      page = "color-mix(in srgb, " + colors[2] + " 38%, #090a20)";
      panel = "color-mix(in srgb, " + colors[2] + " 34%, #17162f)";
      surface = "color-mix(in srgb, " + colors[2] + " 25%, #23213e)";
      soft = "color-mix(in srgb, " + colors[2] + " 20%, #17172f)";
      text = "#f7f4ff";
      muted = "color-mix(in srgb, " + colors[1] + " 50%, #c8c6e7)";
      border = "color-mix(in srgb, " + colors[1] + " 52%, " + colors[2] + ")";
      buttonText = "#20172d";
      scene = "radial-gradient(ellipse at 50% 48%, color-mix(in srgb, " + colors[2] + " 70%, #34305e), color-mix(in srgb, " + colors[2] + " 36%, #17152f) 70%, #090a20 100%)";
    }

    root.dataset.jfTheme = name;
    root.style.colorScheme = name === "classic" ? "light" : "dark";
    root.dataset.jfKodokuPoster = saved.kodokuPoster ? "on" : "off";
    root.style.setProperty("--jf-primary", colors[0]);
    root.style.setProperty("--jf-secondary", colors[1]);
    root.style.setProperty("--jf-glow", colors[2]);
    root.style.setProperty("--pink", colors[0]);
    root.style.setProperty("--cyan", colors[1]);
    root.style.setProperty("--jf-aero-blur", saved.blur ? "5px" : "0px");
    root.style.setProperty("--jf-font-family", JSON.stringify(font));
    root.style.setProperty("--jf-ui-page", page);
    root.style.setProperty("--jf-ui-panel", panel);
    root.style.setProperty("--jf-ui-surface", surface);
    root.style.setProperty("--jf-ui-soft", soft);
    root.style.setProperty("--jf-ui-text", text);
    root.style.setProperty("--jf-ui-muted", muted);
    root.style.setProperty("--jf-ui-border", border);
    root.style.setProperty("--jf-ui-button-text", buttonText);
    root.style.setProperty("--jf-ui-scene", scene);
    root.style.setProperty("--jf-ui-button", "linear-gradient(180deg, color-mix(in srgb, " + colors[0] + " 72%, white), " + colors[0] + " 52%, color-mix(in srgb, " + colors[0] + " 68%, " + colors[2] + "))");
    root.style.setProperty("--jf-ui-button-border", colors[1]);
    return { name, colors };
  }

  window.JFThemeBridge = { apply, palettes };
  apply(read("junto_theme"));
  window.addEventListener("jf-theme-updated", event => apply(event.detail));
  window.addEventListener("storage", event => {
    if (event.key === "junto_theme" || event.key === "junto_options") apply(read("junto_theme"));
  });
})();