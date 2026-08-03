import eslintConfig from "@antfu/eslint-config";
import nuxtConfig from "./.nuxt/eslint.config.mjs";

export default eslintConfig(
  // General
  {
    typescript: true,
    vue: true,
    stylistic: false,
    rules: {
      curly: "off",
      "eol-last": "off",
      "jsonc/indent": "off",
      "no-console": "off",
      "no-new-func": "off",
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
      "antfu/consistent-chaining": "off",
      "antfu/consistent-list-newline": "off",
      "unicorn/number-literal-case": "off",
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
      "vue/comma-dangle": "off",
      "vue/html-indent": "off",
      "vue/html-self-closing": "off",
      "vue/operator-linebreak": "off",
      "vue/script-indent": "off",
      "vue/singleline-html-element-content-newline": "off",
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

  nuxtConfig()
);
