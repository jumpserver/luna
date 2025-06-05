# 主题系统

## 简介

主题系统用于管理应用的颜色方案，提供了一套简单的方式来定义和应用主题。每个主题只定义一个主色（基于 `--el-main-bg-color` 的值），其他颜色通过颜色处理函数基于主色生成。

## 主题结构

主题系统由以下几个部分组成：

1. **主题颜色定义**：在 `themes.ts` 中集中定义所有主题的主色，主色值来源于原始配置中的 `--el-main-bg-color` 值。

2. **颜色处理函数**：在 `interface/index.ts` 中定义，包括 `lighten`, `darken`, `saturate`, `desaturate`, `alpha` 等函数，用于基于主色生成不同明暗度和透明度的颜色。

3. **主题文件**：每个区域有一个对应的主题文件，如 `main.ts`, `menu.ts`, `header.ts`, `dropdown.ts`，每个文件定义了该区域的 CSS 变量，大部分颜色都基于主色生成，少数特殊颜色使用固定值。

## 使用方法

### 获取主题颜色

使用 `getThemeColor` 函数获取当前主题的主色：

```typescript
import { getThemeColor } from "./themes";

// 获取当前主题的主色
const themeColor = getThemeColor();
```

### 颜色处理函数

颜色处理函数接受两个参数：

```typescript
function lighten(amount: number, color: string): string;
function darken(amount: number, color: string): string;
function saturate(amount: number, color: string): string;
function desaturate(amount: number, color: string): string;
function alpha(amount: number, color: string): string;
```

- `amount`: 处理的程度，对于 lighten 和 darken，表示百分比（0-100）；对于 alpha，表示透明度（0-1）
- `color`: 基础颜色

### 示例

```typescript
import { lighten, darken } from "./interface/index";
import { getThemeColor } from "./themes";

// 主题对象
export const mainTheme = {
  // 主区域背景
  "--el-main-bg-color": getThemeColor(),
  // 主区域文本颜色
  "--el-main-text-color": "#EFEFF0",
  // 其他 CSS 变量...
};
```

## 添加新主题

要添加新的主题类型，只需在 `themes.ts` 文件中的 `themes` 对象中添加新的主题颜色：

```typescript
// 在 themes.ts 中添加新主题
export const themes = {
  default: "#1E1C1C",
  darkBlue: "#141618",
  newTheme: "#YOUR_COLOR", // 添加新主题
};
```

然后在 `useTheme.ts` 中的 `switchTheme` 函数中添加对新主题的支持：

```typescript
const switchTheme = () => {
  if (ThemeType === "darkBlue") {
    html.setAttribute("class", "darkBlue");
  } else if (ThemeType === "newTheme") {
    // 添加新主题的处理
    html.setAttribute("class", "newTheme");
  } else {
    html.setAttribute("class", "");
  }

  // 应用所有主题
  initTheme();
};
```

## 颜色调整指南

在调整主题颜色时，可以参考以下指南：

1. **主色选择**：主色应该选择一个适合作为背景的深色，如 `#1E1C1C`（default 主题）或 `#141618`（darkBlue 主题）。

2. **亮度调整**：

   - 对于比主色更亮的区域，使用 `lighten` 函数，如 `lighten(20, getThemeColor())`
   - 对于比主色更暗的区域，使用 `darken` 函数，如 `darken(10, getThemeColor())`
   - 调整 `amount` 参数可以控制亮度变化的程度

3. **特殊颜色**：对于一些特殊的颜色，如文本颜色、强调色等，可以使用固定的颜色值，如 `#EFEFF0`、`#7494f3` 等。

## 优势

- **极简设计**：每个主题只需定义一个主色，大大简化了主题配置
- **一致性**：所有区域的颜色都基于同一个主色生成，确保视觉一致性
- **易于扩展**：添加新主题只需添加一个新的颜色值，无需为每个区域单独配置颜色
- **灵活性**：通过颜色处理函数，可以基于主色生成各种不同明暗度和透明度的颜色
- **接近原始设计**：通过调整颜色处理函数的参数，可以使生成的颜色接近原始设计的颜色

## 切换主题

目前，主题切换通过在 HTML 根元素上设置 class 来实现。在 `useTheme.ts` 中的 `switchTheme` 函数处理这个逻辑。

如果需要添加新的主题类型，可以修改 `switchTheme` 函数来支持新的主题类型。
