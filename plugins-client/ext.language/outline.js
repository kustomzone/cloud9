/**
 * Outline support.
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var settings = require("core/settings");
var editors = require("ext/editors/editors");
var Range = require("ace/range").Range;
var menus = require("ext/menus/menus");
var commands = require("ext/commands/commands");
var gotofile = require("ext/gotofile/gotofile");
var search = require("ext/gotofile/search");

module.exports = {
    nodes: [],
    fullOutline : [],
    filteredOutline : [],
    ignoreSelectOnce : false,
    isDirty : false,
    
    hook: function(oExt, worker) {
        this.worker = worker;
        var _self = this;
        
        worker.on("outline", function(event) {
            _self.openOutline(event);
        }); 
        
        commands.addCommand({
            name: "outline",
            hint: "search for a definition and jump to it",
            bindKey: {mac: "Command-Shift-E", win: "Ctrl-Shift-E"},
            isAvailable : function(editor) {
                return editor && editor.ceEditor;
            },
            exec: function () {
                _self.updateOutline(true);
            }
        });
        
        var mnuItem = new apf.item({
            command : "outline"
        });

        this.nodes.push(
            menus.addItemByPath("Tools/Quick Outline", mnuItem, 100),
            menus.addItemByPath("Goto/Goto Definition...", mnuItem.cloneNode(false), 110)
        );
        
        ide.addEventListener("init.ext/gotofile/gotofile", function() {
            var selStart, selEnd;
            
            dgGoToFile.parentNode.insertBefore(treeOutline, dgGoToFile);
            txtGoToFile.addEventListener("afterchange", function(e) {
                _self.onAfterChange(e);
            }, true);            
            txtGoToFile.addEventListener("keydown", function(e) {
                _self.onKeyDown(e);
            });
            txtGoToFile.addEventListener("keyup", function(e) {
                _self.onKeyUp(e);
            });
            treeOutline.addEventListener("onafterselect", function() {
                _self.onSelect(treeOutline.selected);
            });
            treeOutline.addEventListener("onafterchoose", function() {
                gotofile.toggleDialog(-1);
            });
            treeOutline.addEventListener("click", function(e) {
                var COLLAPSE_AREA = 14
                if (e.htmlEvent.x >= treeOutline.$container.getClientRects()[0].left + 14)
                    gotofile.toggleDialog(-1);
            });
            txtGoToFile.addEventListener("blur", function() {
                selStart = txtGoToFile.$input.selectionStart;
                selEnd = txtGoToFile.$input.selectionEnd;
            });
            treeOutline.addEventListener("focus", function() {
                txtGoToFile.focus();
                if (selStart && selEnd) {
                    txtGoToFile.$input.selectionStart = selStart;
                    txtGoToFile.$input.selectionEnd = selEnd;
                }
            });
            treeOutline.bufferselect = false;
        });   

    },

    outlineJsonToXml: function(array, selected, tag) {
        var xmlS = [];
        for (var i = 0; i < array.length; i++) {
            var elem = array[i];
            var pos = elem.displayPos || elem.pos;
            xmlS.push('<'); xmlS.push(tag); xmlS.push(' name="'); xmlS.push(elem.name);
                xmlS.push('" icon="' + (elem.icon || "method"));
                xmlS.push('" sl="'); xmlS.push(pos.sl);
                xmlS.push('" el="'); xmlS.push(pos.el);
                xmlS.push('" sc="'); xmlS.push(pos.sc);
                xmlS.push('" ec="'); xmlS.push(pos.ec);
                xmlS.push('" elx="'); xmlS.push(elem.pos.el);
            elem.meta && xmlS.push('" meta="') && xmlS.push(elem.meta);
                if (elem === selected)
                    xmlS.push('" selected="true');
                xmlS.push('">\n');
            xmlS = xmlS.concat(this.outlineJsonToXml(elem.items, selected, 'entry'));
                xmlS.push('</'); xmlS.push(tag); xmlS.push('>');
        }
        return xmlS.join('');
    },
    
    updateOutline : function(showNow) {
        this.showOutline(showNow);
        /* TODO: set loading message if file has changed
        treeOutline.$setClearMessage(treeOutline["loading-message"], "loading");
        apf.setOpacity(winGoToFile.$ext, 1);
        */
        this.worker.emit("outline", { data : { showNow: showNow } });
    },

    findCursorInOutline: function(json, cursor) {
        for (var i = 0; i < json.length; i++) {
            var elem = json[i];
            if(cursor.row < elem.pos.sl || cursor.row > elem.pos.el)
                continue;
            var inChildren = this.findCursorInOutline(elem.items, cursor);
            return inChildren ? inChildren : elem;
        }
        return null;
    },

    openOutline : function(event) {
        var data = event.data;
        if (data.error) {
            // TODO: show error in outline?
            console.log("Oh noes! " + data.error);
            return;
        }
        
        this.fullOutline = event.data.body;
        this.renderOutline(event.data.showNow);
        
        var editor = editors.currentEditor;
        var ace = editor.ceEditor.$editor;
        var cursor = ace.getCursorPosition();
        this.$originalLine = cursor.row + 1;
        this.$originalColumn = cursor.column;
        
        if (event.data.showNow)
            this.showOutline(true);
        else if (txtGoToFile.value.match(/^@/))
            this.showOutline();

        this.scrollToSelected();
    },
    
    /**
     * Show the outline view in the goto dialog,
     * instead of the file list.
     */
    showOutline: function(makeVisible) {
        if (makeVisible) {
            gotofile.toggleDialog(1);
            txtGoToFile.focus();
            this.showOutline();
            if (txtGoToFile.value.length > 0)
                txtGoToFile.$input.selectionStart = 1;
        }
        gotofile.setEventsEnabled(false);
        if (!dgGoToFile.getProperty("visible"))
            return;
        if (!txtGoToFile.value.match(/^@/))
            txtGoToFile.setValue("@");
        else
            txtGoToFile.setValue(txtGoToFile.value);
        this.ignoreSelectOnce = true;
        dgGoToFile.hide();
        treeOutline.show();
        if (makeVisible)
            txtGoToFile.$input.selectionStart = 1;
    },
    
    showFileSearch: function() {
        gotofile.setEventsEnabled(true);
        if (dgGoToFile.getProperty("visible"))
            return;
        gotofile.filter(txtGoToFile.value.match(/^@/) ? "" : txtGoToFile.value, false, true);
        dgGoToFile.show();
        treeOutline.hide();
    },
    
    renderOutline: function(ignoreFilter) {
        ext.initExtension(gotofile);
        var filter = ignoreFilter ? "" : txtGoToFile.value.substr(1);
        this.isDirty = ignoreFilter;
        
        var outline = this.filteredOutline = search.treeSearch(this.fullOutline, filter);

        /* TODO: set "empty" message
        if (outline.length === 0)
            treeOutline.clear(treeOutline["empty-message"], "empty");
        else
            treeOutline.$removeClearMessage();
        */
    },
    
    scrollToSelected: function() {
        var outline = this.filteredOutline;
        var ace = editors.currentEditor.amlEditor.$editor;
        
        var selected = this.findCursorInOutline(outline, ace.getCursorPosition());
        mdlOutline.load(apf.getXml('<data>' + this.outlineJsonToXml(outline, selected, 'entries') + '</data>'));

        var node = mdlOutline.queryNode("//*[@selected]");
        if (node) {
            this.ignoreSelectOnce = true;
            treeOutline.select(node);
            var htmlNode = apf.xmldb.getHtmlNode(node, treeOutline);
            htmlNode.scrollIntoView();
        }
        else { //if (mdlOutline.data.childNodes[0]) {        
            // HACK: Need to set to non-falsy value first
            treeOutline.$container.scrollTop = 1;
            treeOutline.$container.scrollTop = 0;
            //mdlOutline.data.childNodes[0].scrollIntoView();
        }
    },

    onSelect: function(el) {
        if (this.ignoreSelectOnce) {
            this.ignoreSelectOnce = false;
            return;
        }
        var editor = editors.currentEditor.amlEditor.$editor;
        var range = new Range(+el.getAttribute("sl"), +el.getAttribute("sc"),
            +el.getAttribute("el"), +el.getAttribute("ec"));
        this.scrollToDefinition(editor, +el.getAttribute("sl"), +el.getAttribute("elx") || +el.getAttribute("el"));
        editor.selection.setSelectionRange(range);
    },
    
    scrollToDefinition: function(editor, line, lineEnd) {
        var lineHeight = editor.renderer.$cursorLayer.config.lineHeight;
        var lineVisibleStart = editor.renderer.scrollTop / lineHeight
        var linesVisible = editor.renderer.$size.height / lineHeight;
        lineEnd = Math.min(lineEnd, line + linesVisible);
        if (lineVisibleStart <= line && lineEnd <= lineVisibleStart + linesVisible)
            return; 
        editor.scrollToLine((line + lineEnd) / 2 - 1, true);  
    },
    
    onKeyDown: function(e) {
        if (gotofile.eventsEnabled)
            return;
            
        if (e.keyCode === 27) { // Escape
            if (this.$originalLine) {
                var editor = editors.currentEditor;
                var ace = editor.ceEditor.$editor;
                ace.gotoLine(this.$originalLine, this.$originalColumn, apf.isTrue(settings.model.queryValue("editors/code/@animatedscroll")));
                
                delete this.$originalLine;
                delete this.$originalColumn;
            }
            gotofile.toggleDialog(-1);
        }
        else if (e.keyCode === 13) { // Enter
            gotofile.toggleDialog(-1);
        }
        else if (e.keyCode === 40) { // Down
            e.preventDefault();
            delete e.currentTarget;
            treeOutline.dispatchEvent("keydown", e);
            return;
        }
        else if (e.keyCode === 38) { // Up
            e.preventDefault();
            delete e.currentTarget;
            treeOutline.dispatchEvent("keydown", e);
            return;
        }
        else if (this.isDirty) {
            this.renderOutline();
        }
    },
    
    onKeyUp: function(e) {
        if (e.keyCode === 50) // @
            this.updateOutline();
    },
    
    getNodeAfter: function(node) {
        if (node.childNodes[1] && treeOutline.isCollapsed(node.childNodes[1])) {
            return node.childNodes[1];
        } else {
            while (!node.nextSibling && node.parentNode)
                node = node.parentNode;
            return node.nextSibling;
        }
    },
    
    getNodeBefore: function(node) {
        if (node.previousSibling && node.previousSibling.attributes) {
            node = node.previousSibling;
            while (node.childNodes[1] && treeOutline.isCollapsed(node.childNodes[1]))
                node = node.childNodes[1];
            return node;
        } else {
            return node.parentNode == treeOutline.root ? null : node.parentNode;
        }
    },
    
    onAfterChange: function(event) {
        if (txtGoToFile.value.match(/^@/)) {
            this.updateOutline();
            gotofile.setEventsEnabled(false);
        }
        else {
            this.showFileSearch();
        }
        this.renderOutline();
    }
};
});

