# Scarpet Formatter

This extension wraps [js-beautify](https://github.com/beautify-web/js-beautify) to format your Scarpet Script.
This project is modifying based on "Lonefy/vscode-JS-CSS-HTML-formatter" under MIT license, new code of this project is under gpl-v3 license

## How To Use

*  open `Context Menu` and choose `Format Code`
*  shortcuts: `Alt+Shift+F`
*  CLI: Press `F1`, enter `Format Code`

>the upper 3 ways don't work for `Javascript`&`JSON` after `vscode v0.10.10`, but you can still format `CSS` and `HTML`.

### To format **Javascript,CSS and HTML** after vscode v0.10.10
*  CLI: Press `F1`,enter `Formatter`

## Config

1. Press `F1`, enter `Formatter Config`, open the config file:

   ![image](https://cloud.githubusercontent.com/assets/7921431/15070016/2bf251a4-13b4-11e6-8ebe-eefaa6adcbf6.png)

2. Edit the file as your needs. This extension uses `js-beautify` internally, so you can edit the parameters which `js-beautify` can use.

   ![image](https://cloud.githubusercontent.com/assets/7921431/15069887/47ee136c-13b3-11e6-9505-4a3b378be601.png)

3. `Restart` vscode  **[!Important]**



## THANKS:
rjmacarthy, zhaopengme, Arrow7000, bitwiseman, Lonefy
