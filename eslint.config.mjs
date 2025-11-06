import eslintConfig from "@antfu/eslint-config";
import nuxtConfig from "./.nuxt/eslint.config.mjs";

export default eslintConfig(
  // General
  {
    typescript: true,
    vue: true,
    stylistic: {
      indent: 2,
      quotes: "double"
    },
    rules: {
      curly: "off",
      "eol-last": "off",
      "jsonc/indent": "off",
      "no-console": "off",
      "no-new-func": "off",
      "style/semi": ["error", "always"],
      "style/indent": ["error", 2],
      "style/quotes": "off",
      "@typescript-eslint/semi": "off",
      "@typescript-eslint/member-delimiter-style": "error",
      "style/quote-props": ["warn", "as-needed"],
      "style/comma-dangle": ["warn", "never"],
      "style/brace-style": ["warn", "1tbs"],
      "style/arrow-parens": ["error", "always"],
      "vue/block-order": [
        "error",
        {
          order: ["script", "template", "style"]
        }
      ],
      "vue/script-indent": [
        "error",
        2,
        {
          baseIndent: 0
        }
      ],
      "vue/html-indent": [
        "error",
        2,
        {
          attribute: 1,
          baseIndent: 1,
          closeBracket: 0
        }
      ],
      "vue/comma-dangle": ["warn", "never"],
      "antfu/top-level-function": "off",
      "antfu/if-newline": "off",
      "new-cap": "off",
      "node/prefer-global/process": ["off"],
      "@typescript-eslint/prefer-ts-expect-error": "off"
    }
  },

  // Vue
  {
    files: ["**/*.vue"],
    rules: {
      "style/indent": "off",
      "vue/script-indent": "off"
    }
  },

  nuxtConfig()
);
