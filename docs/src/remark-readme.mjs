/**
 * Makes a README read as a site page:
 *  - drops the leading `# Title`, which Starlight renders from frontmatter;
 *  - turns links between READMEs into site URLs, so `../02-x/README.md`
 *    works on GitHub and `../02-x/` works here.
 */
export default function remarkReadme() {
  return (tree) => {
    const first = tree.children.findIndex((node) => node.type === 'heading');

    if (first !== -1 && tree.children[first].depth === 1) {
      tree.children.splice(first, 1);
    }

    visitLinks(tree, (node) => {
      if (/^[a-z]+:/i.test(node.url)) return;
      node.url = node.url
        .replace(/^src\/(\d\d-[^/]+)\/README\.md/, '$1/')
        .replace(/^\.\.\/\.\.\/README\.md/, '../')
        .replace(/^\.\.\/(\d\d-[^/]+)\/README\.md/, '../$1/');
    });
  };
}

function visitLinks(node, fn) {
  if (node.type === 'link') fn(node);

  for (const child of node.children ?? []) visitLinks(child, fn);
}
