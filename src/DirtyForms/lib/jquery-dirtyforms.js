/*!
Dirty Forms jQuery Plugin | v2.0.0 | (Modified by Alexander Assink)
Unmodified source can be found on: github.com/snikch/jquery.dirtyforms
(c) 2010-2015 Mal Curtis, 2017 Alexander Assink
License MIT
*/

(function($, window, document, undefined) {
    // Can't use ECMAScript 5's strict mode because several apps 
    // including ASP.NET trace the stack via arguments.caller.callee 
    // and Firefox dies if you try to trace through "use strict" call chains. 
    // See jQuery issue (#13335)
    // Support: Firefox 18+
    //"use strict";

    if (!$.fn.on) {
        // Patch jQuery 1.4.2 - 1.7 with an on function (that uses delegate).
        $.fn.on = function (events, selector, data, handler) {
            return this.delegate(selector, events, data, handler);
        };
    }

    $.fn.dirtyForms = function (method) {
        // Method calling logic
        if (methods[method]) {
            return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
        } else if (typeof method === 'object' || !method) {
            return methods.init.apply(this, arguments);
        } else {
            $.error('Method ' + method + ' does not exist on jQuery.dirtyForms');
        }
    };

    // Public Element methods ( $('form').dirtyForms('methodName', args) )
    var methods = {
        init: function (options) {
            var data = {};

            if (!state.initialized) {
                // Override any default options
                $.extend(true, $.DirtyForms, options);
                $(document).trigger('bind.dirtyforms', [events]);
                events.bind(window, document, data);
                state.initialized = true;
            }
            
            this.filter($.DirtyForms.formSelector).not(':dirtylistening').each(function () {
                var $form = $(this);
                dirtylog('Adding form ' + $form.attr('id') + ' to forms to watch');

                // Store original values of the fields
                $form.find($.DirtyForms.fieldSelector).each(function () {
                    storeOriginalValue($(this));
                });

                $form.trigger('scan.dirtyforms');
                events.bindForm($form, data);
                
            });
            
            return this;
        },
        // Returns true if any of the selected elements or their children are dirty
        isDirty: function (excludeHelpers) {
            dirtylog('isDirty called');

            var ignoreSelector = getIgnoreSelector(),
                dirtyClass = $.DirtyForms.dirtyClass,
                isDirty = false;

            this.each(function (index) {
                var $node = $(this),
                    ignored = isFieldIgnored($node, ignoreSelector);

                if ($node.hasClass(dirtyClass) && !ignored) {
                    isDirty = true;
                    // Exit out of the .each() function
                    return false;
                }

                // Check any descendant nodes (if this is a container element)
                $node.find('.' + dirtyClass).each(function () {
                    if (!isFieldIgnored($(this), ignoreSelector)) {
                        isDirty = true;
                        // Exit out of the .each() function
                        return false;
                    }
                });
                // Exit out of the .each() function
                if (isDirty) return false;

                if (!ignored && !excludeHelpers) {
                    // Test helpers for this node.
                    $.each($.DirtyForms.helpers, function (i, helper) {
                        if (helper.isDirty && helper.isDirty($node, index)) {
                            isDirty = true;
                            // Exit out of the .each() function
                            return false;
                        }
                    });

                    // Exit out of the .each() function
                    if (isDirty) return false;
                }
            });

            return isDirty;
        },
        // Marks the element(s) and any helpers within the element not dirty.
        // If all of the fields in a form are marked not dirty, the form itself will be marked not dirty even
        // if it is not included in the selector. Also resets original values to the current state - 
        // essentially "forgetting" the node or its descendants are dirty.
        // Alexander Assink; fix; setFieldStatus instead of setDirtyStatus so radiobuttons are be handled
        setClean: function (excludeIgnored, excludeHelpers) {
            dirtylog('setClean called');

            var doSetClean = function () {
                clearOriginalValue($(this));
            };
            
            elementsInRange(this, $.DirtyForms.fieldSelector, excludeIgnored)
                .each(doSetClean)
                .parents($.DirtyForms.formSelector).trigger('setclean.dirtyforms', [excludeIgnored]);

            if (excludeHelpers) return this;
            return fireHelperMethod(this, 'setClean', excludeIgnored, getIgnoreSelector());
        },
        // Scans the selected elements and descendants for any new fields and stores their original values.
        // Ignores any original values that had been set previously. Also resets the dirty status of all fields
        // whose ignore status has changed since the last scan.
        // Alexander Assink; fix; setFieldStatus instead of setDirtyStatus so radiobuttons are be handled
        rescan: function (excludeIgnored, excludeHelpers) {
            var doRescan = function () {
                var $field = $(this);

                // Skip previously added fields.
                if (!hasOriginalValue($field)) {
                    // Store the original value.
                    storeOriginalValue($field);
                }
                // Set the dirty status.
                setFieldStatus($field, excludeIgnored); 
            };

            elementsInRange(this, $.DirtyForms.fieldSelector, excludeIgnored)
                .each(doRescan)
                .parents($.DirtyForms.formSelector).trigger('rescan.dirtyforms', [excludeIgnored]);

            if (excludeHelpers) return this;
            return fireHelperMethod(this, 'rescan', excludeIgnored, getIgnoreSelector());
        },
        // Alexander Assink, reset all dirty fields on the form to their original clean state.
        resetForm: function (excludeIgnored, excludeHelpers) {
            dirtylog('reset called');

            var doReset = function () {
                var $field = $(this);
                resetFieldValue($field, excludeIgnored);
            };
            
            elementsInRange(this, $.DirtyForms.fieldSelector, excludeIgnored)
                .each(doReset)
                .parents($.DirtyForms.formSelector).trigger('reset.dirtyforms', [excludeIgnored]);

            if (excludeHelpers) return this;
            return fireHelperMethod(this, 'reset', excludeIgnored, getIgnoreSelector());
        },
        // Alexander Assink, reset a single field to its original clean state.
        resetField: function (field, excludeIgnored, excludeHelpers) {
            dirtylog('resetField called');
            resetFieldValue($(field), excludeIgnored);
        },
        // Alexander Assink, inform a field change detected external API (f.e. Mendix)
        onFieldChange: function (mxev) {
            dirtylog('onFieldChange called');
            // Pass it on to the regular event handler
            events.onFieldChange(mxev);
        },
        // Alexander Assink, preload a form with original values and set field to dirty.
        preload: function (objs, excludeIgnored, excludeHelpers) {
            dirtylog('preload called');

            var $form = $(this);
            var dataIdentifier = 'df-orig';
            var mendixContext = '-' + $form.attr('mendix-context-id');
            dataIdentifier = dataIdentifier.concat(mendixContext);

            var preloadField = function (el, value) {
                 var $field = $(el);
                 if ($field.length !== 0) {
                    // Set the original value to the provided preload value
                    if ($field.is(':checkbox')) {
                        // Avoid that we preload boolean values as string
                        value = (value == 'true');
                    }
                    // Directly set value from the preload obj instead of field
                    $field.data(dataIdentifier, value)
                    // Sets it to dirty as original value is different than current
                    setFieldStatus($field, excludeIgnored); 
                 } else {
                    // Couldn't find the field that was provided
                    dirtylog('ERROR: check the name attribute, could not find the field and set it to value: ' + value);
                    dirtylog($field);
                 }
            }
            
            // Pass the preloaded dirty values to each respective field.
            $.each(objs, function( index, obj ) {
                // Find the input element related to the provided name
                var $field = $form.find('.mx-name-' + obj.name + ' input:first-child');
                if  ($field.length === 0) {
                    // Look for selector if no input element was found
                    $field = $form.find('.mx-name-' + obj.name + ' select:first-child');
                }
                // Pass on the field for processing
                preloadField($field, obj.value, excludeIgnored);
            });
        }
    };

    // Custom selectors $('form:dirty')
    $.extend($.expr[":"], {
        dirty: function (element) {
            var $element = $(element);
            return $element.hasClass($.DirtyForms.dirtyClass) && !$element.is(':dirtyignored');
        },
        dirtylistening: function (element) {
            return $(element).hasClass($.DirtyForms.listeningClass);
        },
        dirtyignored: function (element) {
            return isFieldIgnored($(element), false);
        }
    });

    // Public General Plugin properties and methods $.DirtyForms
    $.DirtyForms = {
        formSelector: "",   // Alexander Assink, added selector and replaced all reference to html form elements
        message: "You've made changes on this page which aren't saved. If you leave you will lose these changes.",
        dirtyClass: 'dirty',
        listeningClass: 'dirtylistening',
        ignoreClass: 'dirtyignore',
        ignoreSelector: '',
        // exclude all HTML 4 except checkbox, option, text and password, but include HTML 5 except search
        fieldSelector: "input:not([type='button'],[type='image'],[type='submit']," +
            "[type='reset'],[type='file'],[type='search']),select,textarea",
        /*<log>*/
        debug: false,
        dirtylog: function (msg) {
            dirtylog(msg);
        },
        /*</log>*/
        helpers: [],
        dialog: false
    };

    // Private State Management
    var state = {
        initialized: false,
        formStash: false,
        dialogStash: false,
        deciding: false,
        decidingEvent: false
    };

    // Dialog Decision Management
    var choice;

    var bindKeys = function (ev) {
        if (ev.data.bindEscKey && ev.which == 27 || ev.data.bindEnterKey && ev.which == 13) {
            return doCommit(ev, false);
        }
    };

    var bindDialog = function (choice) {
        var staySelector = choice.staySelector,
            proceedSelector = choice.proceedSelector;

        if (staySelector !== '') {
            $(staySelector).unbind('click', doCommit)
                             .click(doCommit);
        }
        if (proceedSelector !== '') {
            $(proceedSelector).unbind('click', doProceed)
                               .click(doProceed);
        }
        if (choice.bindEscKey || choice.bindEnterKey) {
            $(document).unbind('keydown', bindKeys)
                       .keydown(choice, bindKeys);
        }
    };

    var callDialogClose = function (proceeding, unstashing) {
        if ($.isFunction($.DirtyForms.dialog.close)) {
            dirtylog('Calling dialog close');
            $.DirtyForms.dialog.close(proceeding, unstashing);
        }
    };

    var doProceed = function (ev) {
        return doCommit(ev, true);
    };

    var doCommit = function (ev, proceeding) {
        if (!state.deciding) return;
        ev.preventDefault();

        if (proceeding === true) {
            var refireEvent = state.decidingEvent;
            $(document).trigger('proceed.dirtyforms', [refireEvent]);
            events.clearUnload(); // fix for chrome/safari
            callDialogClose(proceeding, false);
            refire(refireEvent);
        } else {
            $(document).trigger('stay.dirtyforms');
            var isUnstashing = $.DirtyForms.dialog !== false && state.dialogStash !== false && $.isFunction($.DirtyForms.dialog.unstash);
            callDialogClose(proceeding, isUnstashing);
            if (isUnstashing) {
                dirtylog('Refiring the dialog with stashed content');
                $.DirtyForms.dialog.unstash(state.dialogStash, ev);
            }
            $(document).trigger('afterstay.dirtyforms');
        }

        state.deciding = state.decidingEvent = state.dialogStash = state.formStash = false;
        return false;
    };

    // Event management
    var events = {
        bind: function (window, document, data) {
            $(window).bind('beforeunload', data, events.onBeforeUnload);
            $(document).on('click', 'a:not([target="_blank"])', data, events.onAnchorClick)
                       .on('submit', 'form', data, events.onSubmit);
        },
        bindForm: function ($form, data) {
            var dirtyForms = $.DirtyForms;

            // Test whether we are dealing with IE < 10
            var isIE8_9 = ('onpropertychange' in document.createElement('input'));
            var inputEvents = 'change input' + (isIE8_9 ? ' keyup selectionchange cut paste' : '');

            $form.addClass(dirtyForms.listeningClass)
                 .on('focus keydown', dirtyForms.fieldSelector, data, events.onFocus)
                 .on(inputEvents, dirtyForms.fieldSelector, data, events.onFieldChange)
                 .bind('reset', data, events.onReset);
        },
        // For any fields added after the form was initialized, store the value when focused.
        onFocus: function (ev) {
            var $field = $(ev.target);
            // TODO
            if (!hasOriginalValue($field)) {
        //    if (!hasOriginalValue($field) && !$field.hasClass( "mx-dateinput-input" )) {
                storeOriginalValue($field);
            }
        },
        onFieldChange: function (ev) {
            var $field = $(ev.target);
            if (ev.type !== 'change') {
                // Keep the key events from slowing down when changing the dirty status on the fly.
                delay(function () { setFieldStatus($field, null, ev); }, 100);
            } else {
                setFieldStatus($field, null, ev);
            }
        },
        onReset: function (ev) {
            var $form = $(ev.target).closest($.DirtyForms.formSelector);
            // Need a delay here because reset is called before the state of the form is reset.
            setTimeout(function () { $form.dirtyForms('setClean'); }, 100);
        },
        onAnchorClick: function (ev) {
            bindFn(ev);
        },
        onSubmit: function (ev) {
            bindFn(ev);
        },
        onBeforeUnload: function (ev) {
            var result = bindFn(ev);

            if (result && state.doubleunloadfix !== true) {
                dirtylog('Before unload will be called, resetting');
                state.deciding = false;
            }

            state.doubleunloadfix = true;
            setTimeout(function () { state.doubleunloadfix = false; }, 200);

            // Only return the result if it is a string, otherwise don't return anything.
            if (typeof result === 'string') {
                // For IE and Firefox prior to version 4, set the returnValue.
                ev.returnValue = result;
                return result;
            }
        },
        onRefireClick: function (ev) {
            var event = new $.Event('click');
            $(ev.target).trigger(event);
            if (!event.isDefaultPrevented()) {
                events.onRefireAnchorClick(ev);
            }
        },
        onRefireAnchorClick: function (ev) {
            var href = $(ev.target).closest('a[href]').attr('href');
            if (href !== undefined) {
                dirtylog('Sending location to ' + href);
                window.location.href = href;
            }
        },
        clearUnload: function () {
            // I'd like to just be able to unbind this but there seems
            // to be a bug in jQuery which doesn't unbind onbeforeunload
            dirtylog('Clearing the beforeunload event');
            $(window).unbind('beforeunload', events.onBeforeUnload);
            window.onbeforeunload = null;
            $(document).trigger('beforeunload.dirtyforms');
        }
    };

    var elementsInRange = function ($this, selector, excludeIgnored) {
        var $elements = $this.filter(selector).add($this.find(selector));
        if (excludeIgnored) {
            $elements = $elements.not(':dirtyignored');
        }
        return $elements;
    };

    var fireHelperMethod = function ($this, method, excludeIgnored, ignoreSelector) {
        return $this.each(function (index) {
            var $node = $(this);

            if (!excludeIgnored || !isFieldIgnored($node, ignoreSelector)) {
                $.each($.DirtyForms.helpers, function (i, helper) {
                    if (helper[method]) { helper[method]($node, index, excludeIgnored); }
                });
            }
        });
    };

    var getFieldValue = function ($field) {

        var value;
        if ($field.is('select')) {
            value = '';
            $field.find('option').each(function () {
                var $option = $(this);
                if ($option.is(':selected')) {
                    if (value.length > 0) { value += ','; }
                    value += $option.val();
                }
            });
        } else if ($field.is(":checkbox,:radio")) {
            value = $field.is(':checked');
        } else {
            value = $field.val();
        }

        return value;
    };

    // Alexander Assink, added to support new reset, preload, etc., features
    var resetFieldValue = function ($field, excludeIgnored) {
        restoreFromOriginalValue($field);
        clearOriginalValue($field);
        $field.focus(); // TODO: fix for at least datetime and boolean...
    //    storeOriginalValue($field);//TODO see if this works
        setFieldStatus($field, excludeIgnored); 
        
    };

    // Alexander Assink, added to support new reset, preload, etc., features
    var setFieldValue = function ($field, value) {
        if ($field.is('select')) {
            var values = value.split(',');
            $field.find('option').each(function () {
                var $option = $(this);
                var index = $.inArray($option.val(), values);
                if (index !== -1) {
                    $option.prop('selected', true);
                } else {
                    $option.prop('selected', false);
                }
            });
        } else if ($field.is(":checkbox,:radio")) {
            $field.prop('checked', value);
            $field.val(value);
        } else {
            $field.val(value);
        }
    };

    var storeOriginalValue = function ($field) {
        
        // Get the field value, store it in the data
        var dataIdentifier = getStoredDataIdentifier($field);
        $field.data(dataIdentifier, getFieldValue($field));
        // Set the empty indicator
        var dataEmptyIdentifier = getEmptyDataIdentifier($field);
        var isEmpty = ($field.data(dataIdentifier) === undefined);
        $field.data(dataEmptyIdentifier, isEmpty);

        dirtylog('Stored original value for ' + $field.attr('name') + ': ' + $field.data(dataIdentifier));
    };

    // Alexander Assink, added to support new reset, preload, etc., features
    var restoreFromOriginalValue = function ($field) {

        // Reset the field based on the attached data with original value
        var dataIdentifier = getStoredDataIdentifier($field);
        setFieldValue($field, $field.data(dataIdentifier));
        // Set the empty indicator
        var dataEmptyIdentifier = getEmptyDataIdentifier($field);
        var isEmpty = ($field.data(dataIdentifier) === undefined);
        $field.data(dataEmptyIdentifier, isEmpty);

        dirtylog('Restored original value for ' + $field.attr('name') + ' to: ' + $field.val());
    };

    // Alexander Assink, added to support new reset, preload, etc., features
    var clearOriginalValue = function ($field) {
        var dataIdentifier = getStoredDataIdentifier($field);
        $field.removeData(dataIdentifier);
        dirtylog('Removed original value for ' + $field.attr('name'));
    };

    var hasOriginalValue = function ($field) {
        var dataIdentifier = getStoredDataIdentifier($field);
        var dataEmptyIdentifier = getEmptyDataIdentifier($field);
        return ($field.data(dataIdentifier) !== undefined || $field.data(dataEmptyIdentifier) === true);
    };

    var getIgnoreSelector = function () {
        var dirtyForms = $.DirtyForms,
            result = dirtyForms.ignoreSelector;
        $.each(dirtyForms.helpers, function (key, obj) {
            if ('ignoreSelector' in obj) {
                if (result.length > 0) { result += ','; }
                result += obj.ignoreSelector;
            }
        });
        return result;
    };

    var isFieldIgnored = function ($field, ignoreSelector) {
        if (!ignoreSelector) {
            ignoreSelector = getIgnoreSelector();
        }
        return $field.is(ignoreSelector) || $field.closest('.' + $.DirtyForms.ignoreClass).length > 0;
    };

    var isFieldDirty = function ($field, ignoreSelector) {
        var hasOriginal = hasOriginalValue($field);
        var isIgnored = isFieldIgnored($field, ignoreSelector);
        if (!hasOriginal || isIgnored) 
            return false;
        
        var dataIdentifier = getStoredDataIdentifier($field);
        var fieldVal = getFieldValue($field);
        var fieldOrig = $field.data(dataIdentifier);
        return (fieldVal != fieldOrig);
    };

    var setFieldStatus = function ($field, ignoreSelector, ev) {
        if (isFieldIgnored($field, ignoreSelector)) return;

        // Option groups are a special case because they change more than the current element.
        if ($field.is(':radio[name]')) {
            var name = $field.attr('name'),
                $form = $field.parents($.DirtyForms.formSelector);

            $form.find(":radio[name='" + name + "']").each(function () {
                var $radio = $(this);
                setDirtyStatus($radio, isFieldDirty($radio, ignoreSelector), ev);
            });
        } else {
            setDirtyStatus($field, isFieldDirty($field, ignoreSelector), ev);
        }
    };

    // Alexander Assink, added event so f.e. the original field value can be shown when it becomes dirty
    var setDirtyStatus = function ($field, isDirty, ev) {
        var dirtyClass = $.DirtyForms.dirtyClass,
            $form = $field.parents($.DirtyForms.formSelector);

        // Check if the field state (e.g. dirty / clean) has changed
        var fieldchanged = (isDirty !== ($field.hasClass(dirtyClass)));
        if (fieldchanged) {
            dirtylog('Setting field dirty status to ' + isDirty + ' on field ' + $field.attr('id'));

            $field.toggleClass(dirtyClass, isDirty);
            if (isDirty) {
                $form.trigger('dirtyfield.dirtyforms', [ $field ]);
            }
            if (!isDirty) {
                $form.trigger('cleanfield.dirtyforms', [ $field ]);
            }
        }

        // Check if the form state (e.g. dirty / clean) has changed
        var formchanged = (isDirty !== ($form.hasClass(dirtyClass) && $form.find(':dirty').length === 0));
        if (formchanged) {
            dirtylog('Setting form dirty status to ' + isDirty + ' on form ' + $form.attr('id'));

            $form.toggleClass(dirtyClass, isDirty);
            if (isDirty) {
                $form.trigger('dirty.dirtyforms');
            }
            if (!isDirty) {
                $form.trigger('clean.dirtyforms');
            }
        }
    };

    var getStoredDataIdentifier = function ($field) {
        var $form = $field.parents($.DirtyForms.formSelector);
        var dataIdentifier = 'df-orig';
        var mendixContext = '-' + $form.attr('mendix-context-id');
        dataIdentifier = dataIdentifier.concat(mendixContext);
        return dataIdentifier;
    };

    var getEmptyDataIdentifier = function ($field) {
        var $form = $field.parents($.DirtyForms.formSelector);
        var dataEmptyIdentifier = 'df-empty';
        var mendixContext = '-' + $form.attr('mendix-context-id');
        dataEmptyIdentifier = dataEmptyIdentifier.concat(mendixContext);
        return dataEmptyIdentifier;
    };

    // A delay to keep the key events from slowing down when changing the dirty status on the fly.
    var delay = (function () {
        var timer = 0;
        return function (callback, ms) {
            clearTimeout(timer);
            timer = setTimeout(callback, ms);
        };
    })();

    var bindFn = function (ev) {
        var $element = $(ev.target),
            eventType = ev.type,
            dirtyForms = $.DirtyForms;
        dirtylog('Entering: Leaving Event fired, type: ' + eventType + ', element: ' + ev.target + ', class: ' + $element.attr('class') + ' and id: ' + ev.target.id);

        // Important: Do this check before calling events.clearUnload()
        if (ev.isDefaultPrevented()) {
            dirtylog('Leaving: Event has been stopped elsewhere');
            return false;
        }

        if (eventType == 'beforeunload' && state.doubleunloadfix) {
            dirtylog('Skip this unload, Firefox bug triggers the unload event multiple times');
            state.doubleunloadfix = false;
            return false;
        }

        if ($element.is(':dirtyignored')) {
            dirtylog('Leaving: Element has ignore class or a descendant of an ignored element');
            events.clearUnload();
            return false;
        }

        if (state.deciding) {
            dirtylog('Leaving: Already in the deciding process');
            return false;
        }

        if (!$($.DirtyForms.formSelector + ':dirtylistening').dirtyForms('isDirty')) {
            dirtylog('Leaving: Not dirty');
            events.clearUnload();
            return false;
        }

        if (eventType == 'submit' && $element.dirtyForms('isDirty')) {
            dirtylog('Leaving: Form submitted is a dirty form');
            events.clearUnload();
            return true;
        }

        // Callback for page access in current state
        $(document).trigger('defer.dirtyforms');

        if (eventType == 'beforeunload') {
            dirtylog('Returning to beforeunload browser handler with: ' + dirtyForms.message);
            return dirtyForms.message;
        }
        if (!dirtyForms.dialog) return;

        // Using the GUI dialog...
        ev.preventDefault();
        ev.stopImmediatePropagation();

        dirtylog('Setting deciding active');
        state.deciding = true;
        state.decidingEvent = ev;

        // Stash the dialog (with a form). This is done so it can be shown again via unstash().
        if ($.isFunction(dirtyForms.dialog.stash)) {
            dirtylog('Stashing dialog content');
            state.dialogStash = dirtyForms.dialog.stash();
            dirtylog('Dialog Stash: ' + state.dialogStash);
        }

        // Stash the form from the dialog. This is done so we can fire events on it if the user makes a proceed choice.
        var stashSelector = dirtyForms.dialog.stashSelector;
        if (typeof stashSelector === 'string' && $element.is('form') && $element.parents(stashSelector).length > 0) {
            dirtylog('Stashing form');
            state.formStash = $element.clone(true).hide();
        } else {
            state.formStash = false;
        }

        dirtylog('Deferring to the dialog');

        // Create a new choice object
        choice = {
            proceed: false,
            commit: function (ev) {
                return doCommit(ev, choice.proceed);
            },
            bindEscKey: true,
            bindEnterKey: false,
            proceedSelector: '',
            staySelector: ''
        };

        dirtyForms.dialog.open(choice, dirtyForms.message, dirtyForms.ignoreClass);
        bindDialog(choice);
    };

    var refire = function (ev) {
        if (ev.type === 'click') {
            dirtylog("Refiring click event");
            events.onRefireClick(ev);
        } else {
            dirtylog("Refiring " + ev.type + " event on " + ev.target);
            var target;
            if (state.formStash) {
                dirtylog('Appending stashed form to body');
                target = state.formStash;
                $('body').append(target);
            }
            else {
                target = $(ev.target).closest('form');
            }
            target.trigger(ev.type);
        }
    };

    // Alexander Assink, bugfix to use the option parameter for logging if provided
    var dirtylog = function (msg) {

        if ($.DirtyForms.dirtylog) {
            $.DirtyForms.dirtylog(msg);
        }
        else {
            if (!$.DirtyForms.debug) return;
            var hasFirebug = 'console' in window && 'firebug' in window.console,
                hasConsoleLog = 'console' in window && 'log' in window.console;
            msg = '[DirtyForms] ' + msg;
            if (hasFirebug) {
                console.log(msg);
            } else if (hasConsoleLog) {
                window.console.log(msg);
            } else {
                alert(msg);
            }
        }
    };

})(jQuery, window, document);
