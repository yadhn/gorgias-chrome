/*
 * Generic methods for autocompletion
 */
Handlebars.registerHelper("splitString", function(context, options){
    if(context){
        var ret = "";


        var tempArr = context.trim().split(options.hash["delimiter"]);
        for(var i=0; i < tempArr.length; i++){
            if (options.data) {
                data = Handlebars.createFrame(options.data || {});
                data.index = i;
            }

            if (typeof options.hash["index"] !== "undefined" && options.hash["index"] === i) {
                return options.fn(tempArr[i], {data: data});
            } else {
                ret = ret + options.fn(tempArr[i], {data: data});
            }
        }
        return ret;
    }
});

var KEY_TAB = 9,
    KEY_UP = 38,
    KEY_DOWN = 40,
    KEY_ENTER = 13;

App.autocomplete.quicktexts = [];
App.autocomplete.cursorPosition = null;

App.autocomplete.isEditable = function(element) {

    var isTextfield = (element.tagName.toLowerCase() === 'input');
    var isTextarea = (element.tagName.toLowerCase() === 'textarea');
    var isContenteditable = App.autocomplete.isContentEditable(element);

    return (isTextfield || isTextarea || isContenteditable);

};

App.autocomplete.isContentEditable = function(element) {
    return element && element.hasAttribute('contenteditable');
};

App.autocomplete.getSelectedWord = function (params) {
    var word = {
        start: 0,
        end: 0,
        text: ''
    };

    var beforeSelection = "";
    var selection = window.getSelection();

    if (App.autocomplete.isContentEditable(params.element)) {
        switch (selection.focusNode.nodeType) {
            // In most cases, the focusNode property refers to a Text Node.
            case (document.TEXT_NODE): // for text nodes it's easy. Just take the text and find the closest word
                beforeSelection = selection.focusNode.textContent;
                break;
            // However, in some cases it may refer to an Element Node
            case (document.ELEMENT_NODE):
                // In that case, the focusOffset property returns the index in the childNodes collection of the focus node where the selection ends.
                if (selection.focusNode.childNodes.length) {
                    beforeSelection = selection.focusNode.childNodes[selection.focusOffset].textContent;
                }
                break;
        }
    } else {
        beforeSelection = $(params.element).val().substr(0, App.autocomplete.cursorPosition.end);
    }

    // Replace all &nbsp; with normal spaces
    beforeSelection = beforeSelection.replace('\xa0', ' ').trim();

    word.start = Math.max(beforeSelection.lastIndexOf(" "), beforeSelection.lastIndexOf("\n"), beforeSelection.lastIndexOf("<br>")) + 1;
    word.text = beforeSelection.substr(word.start);
    word.end = word.start + word.text.length;
    return word;
};

App.autocomplete.getCursorPosition = function (element) {

    if(!element) {
        return false;
    }

    var position = {
            element: element || null,
            offset: 0,
            absolute: {
                left: 0,
                top: 0
            },
            word: null
        };

    var $caret;

    var getRanges = function(sel){
        if (sel.rangeCount){
            var ranges = [];
            for (var i= 0; i < sel.rangeCount; i++){
                ranges.push(sel.getRangeAt(i));
            }
            return ranges;
        }
        return [];
    };

    var restoreRanges = function(sel, ranges){
        for (var i in ranges) {
            sel.addRange(ranges[i]);
        }
    };

    if(App.autocomplete.isContentEditable(position.element)) {
        // Working with editable div
        // Insert a virtual cursor, find its position
        // http://stackoverflow.com/questions/16580841/insert-text-at-caret-in-contenteditable-div

        var selection = window.getSelection();
        // get the element that we are focused + plus the offset
        // Read more about this here: https://developer.mozilla.org/en-US/docs/Web/API/Selection.focusNode
        position.element = selection.focusNode;
        position.offset = selection.focusOffset;

        // First we get all ranges (most likely just 1 range)
        var ranges = getRanges(selection);
        var focusNode = selection.focusNode;
        var focusOffset = selection.focusOffset;

        if (!ranges.length) {
            Raven.captureMessage("A selection without any ranges!");
            return;
        }
        // remove any previous ranges
        selection.removeAllRanges();

        // Added a new range to place the caret at the focus point of the cursor
        var range = new Range();
        var caretText = '<span id="qt-caret"></span>';
        range.setStart(focusNode, focusOffset);
        range.setEnd(focusNode, focusOffset);
        range.insertNode(range.createContextualFragment(caretText));
        selection.addRange(range);
        selection.removeAllRanges();

        // finally we restore all the ranges that we had before
        restoreRanges(selection, ranges);

        // Virtual caret
        $caret = $('#qt-caret');

        if ($caret.length) {

            position.absolute = $caret.offset();
            position.absolute.width = $caret.width();
            position.absolute.height = $caret.height();

            // Remove virtual caret
            $caret.remove();
        }

    } else {

        // Working with textarea
        // Create a mirror element, copy textarea styles
        // Insert text until selectionEnd
        // Insert a virtual cursor and find its position

        position.start = position.element.selectionStart;
        position.end = position.element.selectionEnd;

        var $mirror = $('<div id="qt-mirror" class="qt-mirror"></div>').addClass(position.element.className),
            $source = $(position.element),
            $sourcePosition = $source.offset();

        // copy all styles
        for (var i in App.autocomplete.mirrorStyles) {
            var style = App.autocomplete.mirrorStyles[i];
            $mirror.css(style, $source.css(style));
        }

        var sourceMetrics = $source.get(0).getBoundingClientRect();

        // set absolute position
        $mirror.css({
            top: $sourcePosition.top + 'px',
            left: $sourcePosition.left + 'px',
            width: sourceMetrics.width,
            height: sourceMetrics.height
        });

        // copy content
        $mirror.html($source.val().substr(0, position.end).split("\n").join('<br>'));
        $mirror.append('<span id="qt-caret" class="qt-caret"></span>');

        // insert mirror
        $('body').append($mirror);

        $caret = $('#qt-caret', $mirror);

        position.absolute = $caret.offset();
        position.absolute.width = $caret.width();
        position.absolute.height = $caret.height();

        $mirror.remove();

    }

    return position;
};


//App.autocomplete.replaceWith = function (quicktext, event) {
App.autocomplete.replaceWith = function (params) {

    var word = App.autocomplete.cursorPosition.word;
    var replacement = '';

    App.autocomplete.justCompleted = true; // the idea is that we don't want any completion to popup after we just completed

    var setText = function() {

        App.activePlugin.getData({
            element: params.element
        }, function(err, response) {

            var parsedTemplate = Handlebars.compile(params.quicktext.body)(response);

            if(App.autocomplete.isContentEditable(params.element)) {

                var selection = window.getSelection();
                var range = document.createRange();

                // markdown requires two spaces and \n to for a line break
                // so we use this to also turn any \n into a line break
                replacement = parsedTemplate.replace(/\n/g,' <br />\n');

                if (App.settings.editor_enabled) {
                    // wrap the template in a div
                    // so `marked` doesn't wrap lines in p's
                    replacement = '<div>' + replacement + '</div>';

                    // convert markdown body to html
                    replacement = marked(replacement);
                }

                // setStart/setEnd work differently based on
                // the type of node
                // https://developer.mozilla.org/en-US/docs/Web/API/range.setStart
                var focusNode = params.focusNode;


                // we need to have a text node in the end
                while (focusNode.nodeType === document.ELEMENT_NODE) {
                    if (focusNode.childNodes.length > 0) {
                        focusNode = focusNode.childNodes[selection.focusOffset]; // select a text node
                    } else {
                        // create an empty text node and attach it before the node
                        var tnode = document.createTextNode('');
                        focusNode.parentNode.insertBefore(tnode, focusNode);
                        focusNode = tnode;
                    }
                }

                // clear whitespace in the focused textnode
                if(focusNode.nodeValue) {
                    focusNode.nodeValue = focusNode.nodeValue.trim();
                }

                // if the current word matches the shortcut then remove it otherwise skip it (ex: from dialog)
                if (word.text === params.quicktext.shortcut) {
                    range.setStart(focusNode, word.start);
                    range.setEnd(focusNode, word.end);
                    range.deleteContents();
                } else {
                    range.setStart(focusNode, word.end);
                    range.setEnd(focusNode, word.end);
                }


                var qtNode = range.createContextualFragment(replacement);
                var lastQtChild = qtNode.lastChild;

                range.insertNode(qtNode);

                var caretRange = document.createRange();
                caretRange.setStartAfter(lastQtChild);
                caretRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(caretRange);

                /*

                switch (focusNode.nodeType) {
                    case (document.TEXT_NODE):
                        // clear whitespace in the focused textnode
                        if(focusNode.nodeValue) {
                            focusNode.nodeValue = focusNode.nodeValue.trim();
                        }

                        // remove the shorcut text
                        range.setStart(focusNode, word.start);
                        range.setEnd(focusNode, word.end);
                        range.deleteContents();

                        var qtNode = range.createContextualFragment(replacement);
                        var lastQtChild = qtNode.lastChild;

                        range.insertNode(qtNode);

                        var caretRange = document.createRange();
                        caretRange.setStartAfter(lastQtChild);
                        caretRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(caretRange);
                        break;
                    case (document.ELEMENT_NODE):

                        break;
                }
                */
            } else {

                var $textarea = $(params.element),
                    value = $textarea.val();

                // convert markdown images and links to
                // regular links

                // crazy regex to match markdown links
                // [text](http://)
                var linkRegex = '\\[([^\\]]*)\\]\\(([^)"]+)(?: \\"([^\\"]+)\\")?\\)';

                // prepend ! for markdown images
                // ![alt text](http://)
                var imgRegex = '!' + linkRegex;

                // replace images first
                // because the link regex also matches parts of images
                // but not the other way around
                parsedTemplate = parsedTemplate.replace(new RegExp(imgRegex, 'g'), function(whole, a, b, c) {
                    return b;
                });

                // replace links
                parsedTemplate = parsedTemplate.replace(new RegExp(linkRegex, 'g'), function(whole, a, b, c) {
                    return b;
                });

                var valueNew = '';
                var cursorOffset = word.end + parsedTemplate.length;

                // if the current word matches the shortcut then remove it
                // otherwise skip it (ex: from dialog)
                if (word.text === params.quicktext.shortcut) {

                    valueNew = value.substr(0, word.start) + parsedTemplate + value.substr(word.end);

                    // decrease the cursor offset with the removed text length
                    cursorOffset -= word.end - word.start;

                } else {

                    // don't delete anything in the textarea
                    // just add the qt
                    valueNew = value.substr(0, word.end) + parsedTemplate + value.substr(word.end);

                }

                $textarea.val(valueNew);

                // set focus at the end of the added qt
                $textarea[0].setSelectionRange(cursorOffset, cursorOffset);

            }

        });

    };

    App.autocomplete.dialog.close();

    // we need the callback because the editor
    // doesn't get the focus right-away.
    // so window.getSelection() returns the search field
    // in the dialog otherwise, instead of the editor
    App.autocomplete.focusEditor(params.element, setText);

    // set subject field
    if (params.quicktext.subject) {
        App.activePlugin.setTitle(params.quicktext);
    }

    // updates stats
    App.settings.stats('words', params.quicktext.body.split(' ').length, function () {
    });


};

App.autocomplete.focusEditor = function(element, callback) {

    // return focus to the editor

    // gmail auto-focuses the to field
    // so we need the delay
    setTimeout(function() {
        if(element) {
            element.focus();
        }

        if(callback) {
            callback();
        }
    }, 50);

};

// Mirror styles are used for creating a mirror element in order to track the cursor in a textarea
App.autocomplete.mirrorStyles = [
    // Box Styles.
    'box-sizing', 'height', 'width', 'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'border-width',
    // Font stuff.
    'font-family', 'font-size', 'font-style', 'font-variant', 'font-weight',
    // Spacing etc.
    'word-spacing', 'letter-spacing', 'line-height', 'text-decoration', 'text-indent', 'text-transform',
    // The direction.
    'direction'
];

