import ts from "typescript";
import { expect, it } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import source from "./AppAssetIcon.vue?raw";

const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: "asset-icon", inlineTemplate: true });
const { outputText } = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
});
const component = new Function(
  "require",
  "computed",
  "ref",
  "watch",
  `const exports = {};\n${outputText}\nreturn exports.default;`
)(() => Vue, Vue.computed, Vue.ref, Vue.watch);

interface Node {
  type: string;
  props: Record<string, unknown>;
  children: Node[];
  parent?: Node;
}

const node = (type: string): Node => ({ type, props: {}, children: [] });

function mountIcon(src: string) {
  const props = Vue.reactive({ src, fallback: "i-lucide-database" });
  const root = node("root");
  const renderer = Vue.createRenderer<Node, Node>({
    createElement: node,
    createText: () => node("text"),
    createComment: () => node("comment"),
    insert(child, parent) {
      child.parent = parent;
      parent.children.push(child);
    },
    remove(child) {
      const siblings = child.parent?.children;
      if (siblings) siblings.splice(siblings.indexOf(child), 1);
    },
    patchProp(el, key, _previous, value) {
      el.props[key] = value;
    },
    setText() {},
    setElementText() {},
    parentNode: (el) => el.parent || null,
    nextSibling: () => null
  });
  const app = renderer.createApp({ render: () => Vue.h(component, props) });
  app.component(
    "UIcon",
    Vue.defineComponent({
      props: { name: String },
      setup: (icon) => () => Vue.h("svg", { "data-icon": icon.name })
    })
  );
  app.mount(root);
  return { props, root, unmount: () => app.unmount() };
}

it.each(["mysql.svg", "chrome.svg"])("falls back and recovers after a failed %s image", async (filename) => {
  const { props, root, unmount } = mountIcon(`/luna/icons/${filename}`);
  try {
    const rendered = root.children[0]!;
    const image = rendered.type === "img" ? rendered : rendered.children[0]!;
    expect(image.props.src).toBe(`/luna/icons/${filename}`);
    if (filename === "mysql.svg") {
      expect(rendered.props.class).toContain("text-info");
      expect((rendered.props.style as Record<string, string>).maskImage).toContain(props.src);
    }

    (image.props.onError as () => void)();
    await Vue.nextTick();
    expect(root.children[0]!.props["data-icon"]).toBe("i-lucide-database");

    props.src = "/luna/icons/windows.svg";
    await Vue.nextTick();
    expect(root.children[0]!.type).toBe("img");
    expect(root.children[0]!.props.src).toBe(props.src);
  } finally {
    unmount();
  }
});
