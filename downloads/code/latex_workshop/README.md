# LaTeX 中文排版练习工程

这是一份可修改的完整练习，内容包含中文文档结构、数学公式、交叉引用、TikZ 矢量图、子图、三线表、数字列、跨行跨列、长表格、代码和参考文献。机器人关节表中的数据为教学构造数据，不代表实测性能。

## 文件入口

- `main.tex`：导言区、样式、章节装配。
- `sections/01-structure.tex`：文档结构与自动引用。
- `sections/02-math.tex`：最小二乘、梯度、分段函数、矩阵与定理。
- `sections/03-figures-tables.tex`：子图、数字表格与分组表格。
- `sections/04-long-document.tex`：带续表头的长表格和 ASCII Python 代码。
- `sections/05-references.tex`：文献链路、练习及参考文献表。
- `figures/coordinate-frame.tex`：自行绘制的 TikZ 矢量图源文件。
- `references.bib`：真实出版物的书目数据。

## 在本仓库使用 Docker

先启动 Docker，在仓库根目录运行：

```bash
./bin/site.sh latex-build
./bin/site.sh latex-test
```

`latex-build`创建编译环境镜像。`latex-test`复制本工程到容器工作目录，先编译图，再构建主文档，输出 PDF、日志与逐页预览。需要保留新的练习结果时使用一个新的输出目录：

```bash
./bin/site.sh latex-test build/latex-practice-02
```

默认输出位置与完整验收规则以仓库 `docker/latex-learning/README.md` 和命令输出为准。

## 已有 TeX 环境时单独编译

进入解压后的 `latex_workshop` 目录。需要 XeLaTeX、latexmk、Biber、ctex/Fandol 字体及 `main.tex`声明的宏包；安装完整配套的 TeX 发行版比混用不兼容的 BibLaTeX 与 Biber 更容易复现。

```bash
xelatex -interaction=nonstopmode -halt-on-error -output-directory=figures figures/coordinate-frame.tex
latexmk -xelatex -interaction=nonstopmode -halt-on-error main.tex
```

得到 `main.pdf`。不要先单独编译 `sections/*.tex`，它们通过 `main.tex`获得文档类、宏包和符号定义。`latexmk`按依赖调用 Biber 并补足重复编译；不需要再运行 BibTeX。

两子图使用同一份 `figures/coordinate-frame.pdf`，用于展示子图布局。修改 TikZ 图后，重新执行图的编译命令，再运行 `latexmk`。

## 建议练习

1. 在梯度前插入新公式，确认正文编号和链接自动更新。
2. 给数字表格添加一条记录，检查小数点对齐；扩大整数位数时同步修改 `table-format`。
3. 复制 longtable 数据行直到跨页，确认续表头和页尾出现。
4. 故意把一个引用键写错，定位 `.log`和 `.blg`中的警告，然后恢复。
5. 把定理中的“正定”改为“半正定”，解释为什么能正常排版却不再保证唯一最小点。

## 数据来源与结果解释

书目信息分别核对 [Knuth 作者主页](https://www-cs-faculty.stanford.edu/~knuth/abcde.html) 与 [Pearson 的 Lamport 第二版页面](https://www.pearson.com/en-us/subject-catalog/p/latex-a-document-preparation-system/P200000000419/9780201529838)。两本书用于排版学习，不是表格数据的实验出处。

构建成功只是检查之一。还需要打开每一页，检查越界、缺字、公式和图表位置，点击交叉引用，并独立核对数学推导与数据含义。显式 `\clearpage`用于本练习的主题分隔，正式论文应按其模板和篇幅安排分页。
