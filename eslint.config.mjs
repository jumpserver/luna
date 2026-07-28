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
      "style/member-delimiter-style": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      "style/quote-props": ["warn", "as-needed"],
      "style/comma-dangle": ["warn", "never"],
      "style/brace-style": ["warn", "1tbs"],
      "style/arrow-parens": ["error", "always"],
      "vue/attributes-order": [
        "error",
        {
          order: [
            "DEFINITION",
            "LIST_RENDERING",
            "CONDITIONALS",
            "RENDER_MODIFIERS",
            "GLOBAL",
            "UNIQUE",
            "TWO_WAY_BINDING",
            "OTHER_DIRECTIVES",
            "OTHER_ATTR",
            "EVENTS",
            "CONTENT"
          ],
          alphabetical: false
        }
      ],
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

  // pnpm's trust policy must remain a project-level install decision, not an ESLint autofix.
  {
    files: ["pnpm-workspace.yaml"],
    rules: {
      "pnpm/yaml-enforce-settings": "off"
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

  nuxtConfig(),

  // These packages are formatted with Prettier. Keep their lint rules aligned
  // with Prettier's TypeScript and Vue output so both checks are repeatable.
  {
    files: ["packages/koko/**/*.{ts,vue}", "packages/connectors-core/**/*.{ts,vue}"],
    rules: {
      "antfu/consistent-chaining": "off",
      "antfu/consistent-list-newline": "off",
      "style/member-delimiter-style": [
        "error",
        {
          multiline: { delimiter: "semi", requireLast: true },
          singleline: { delimiter: "semi", requireLast: false }
        }
      ],
      "style/operator-linebreak": ["error", "after", { overrides: { "?": "before", ":": "before" } }],
      "vue/html-indent": "off",
      "vue/html-self-closing": "off",
      "vue/operator-linebreak": ["error", "after", { overrides: { "?": "before", ":": "before" } }],
      "vue/singleline-html-element-content-newline": "off"
    }
  }
);
