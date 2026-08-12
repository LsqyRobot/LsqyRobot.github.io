(function () {
  "use strict";

  function initializeSegments() {
    document.querySelectorAll("[data-segmented]").forEach(function (group) {
      var buttons = Array.from(group.querySelectorAll("button[data-value]"));
      var hiddenInput = group.parentElement.querySelector("input[type='hidden']");

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          buttons.forEach(function (item) {
            var active = item === button;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-pressed", active ? "true" : "false");
          });

          if (hiddenInput) {
            hiddenInput.value = button.dataset.value;
          }
        });
      });
    });
  }

  function initializeFileInputs() {
    document.querySelectorAll("[data-file-input]").forEach(function (input) {
      input.addEventListener("change", function () {
        var dropZone = input.closest(".rt-file-drop");
        var title = dropZone && dropZone.querySelector("[data-file-title]");
        var detail = dropZone && dropZone.querySelector("[data-file-detail]");
        var file = input.files && input.files[0];

        if (!file || !title || !detail) {
          return;
        }

        title.textContent = file.name;
        detail.textContent = formatBytes(file.size) + " · 已就绪，等待算法模块";
        dropZone.classList.add("has-file");
      });
    });
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return "0 B";
    }

    var units = ["B", "KB", "MB", "GB"];
    var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index];
  }

  function initializeFlowPreviews() {
    document.querySelectorAll("[data-preview-flow]").forEach(function (button) {
      button.addEventListener("click", function () {
        var workspace = button.closest(".rt-workspace");
        var state = workspace && workspace.querySelector("[data-preview-state]");
        var items = workspace ? Array.from(workspace.querySelectorAll(".rt-process-list li")) : [];

        if (state) {
          state.textContent = "FLOW READY / KERNEL PENDING";
          state.classList.add("is-updated");
        }

        items.forEach(function (item, index) {
          window.setTimeout(function () {
            item.classList.add("is-previewed");
          }, index * 110);
        });

        var previousText = button.textContent;
        button.textContent = "流程已展开";
        window.setTimeout(function () {
          button.textContent = previousText;
        }, 1600);
      });
    });
  }

  function initializeResets() {
    document.querySelectorAll("[data-reset-form]").forEach(function (button) {
      button.addEventListener("click", function () {
        var workspace = button.closest(".rt-workspace");
        var form = workspace && workspace.querySelector("form");
        var state = workspace && workspace.querySelector("[data-preview-state]");

        if (form) {
          form.reset();
        }

        if (state) {
          state.textContent = "AWAITING INPUT";
          state.classList.remove("is-updated");
        }

        if (workspace) {
          workspace.querySelectorAll(".rt-process-list li").forEach(function (item) {
            item.classList.remove("is-previewed");
          });
          workspace.querySelectorAll("[data-segmented]").forEach(function (group) {
            var buttons = Array.from(group.querySelectorAll("button[data-value]"));
            buttons.forEach(function (item, index) {
              item.classList.toggle("is-active", index === 0);
              item.setAttribute("aria-pressed", index === 0 ? "true" : "false");
            });
          });
          workspace.querySelectorAll(".rt-file-drop").forEach(function (dropZone) {
            dropZone.classList.remove("has-file");
            var title = dropZone.querySelector("[data-file-title]");
            var detail = dropZone.querySelector("[data-file-detail]");
            if (title && title.dataset.defaultText) {
              title.textContent = title.dataset.defaultText;
            }
            if (detail && detail.dataset.defaultText) {
              detail.textContent = detail.dataset.defaultText;
            }
          });
        }
      });
    });
  }

  function initializeToolFilters() {
    var buttons = Array.from(document.querySelectorAll("[data-tool-filter]"));
    var cards = Array.from(document.querySelectorAll("[data-tool-categories]"));

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var filter = button.dataset.toolFilter;

        buttons.forEach(function (item) {
          var active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", active ? "true" : "false");
        });

        cards.forEach(function (card) {
          var categories = card.dataset.toolCategories.split(" ");
          card.hidden = filter !== "all" && categories.indexOf(filter) === -1;
        });
      });
    });
  }

  function initializeYear() {
    document.querySelectorAll("[data-current-year]").forEach(function (element) {
      element.textContent = new Date().getFullYear();
    });
  }

  initializeSegments();
  initializeFileInputs();
  initializeFlowPreviews();
  initializeResets();
  initializeToolFilters();
  initializeYear();
})();
