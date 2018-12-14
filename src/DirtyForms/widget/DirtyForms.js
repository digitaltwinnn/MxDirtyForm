/*global logger*/
/*
    DirtyForms
    ========================

    @file      : DirtyForms.js
    @version   : 1.0.0
    @author    : Alexander Assink
    @date      : 2017-5-17
    @copyright : Alexander Assink
    @license   : MIT

    Documentation
    ========================
    Monitor Mendix dataviews for modifications on any field, make it visual and actionable.
    Please see the readme.md file from the github repository for more details.
*/

// Required module list. Remove unnecessary modules, you can always get them back from the boilerplate.
define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",

    "mxui/dom",
    "dojo/dom-attr",
    "dojo/dom-construct",
    "dojo/_base/lang",
    "dojo/html",
    "dojo/_base/event",
    "dojo/Stateful",

    "DirtyForms/lib/jquery-1.11.2",
    "DirtyForms/lib/jquery-dirtyforms",
], function (declare, _WidgetBase, dom, domAttr, dojoConstruct, lang, dojoHtml, dojoEvent, Stateful, _jQuery, dirtyfields) {
    "use strict";

    var $ = _jQuery.noConflict(true);

    // Declare widget's prototype.
    return declare("DirtyForms.widget.DirtyForms", [ _WidgetBase , Stateful], {

        // DOM elements.
        resetButton: null,

        // Parameters configured in the Modeler.
        // Initalisation with preloaded dirty values.
        preloadMicroflow: "",
        dirtyNameValuePair: "",
        dirtyFieldName:"",
        dirtyValue: "",
        // Behaviors on changes to the dirty state of the widget.
        onDirtyMicroflow: "",
        onCleanMicroflow: "",
        hasResetButton: "",
        browserCloseNotification: "",
        // Display and behavior on the dirty fields
        displayOriginalValue: "",
        originalValuePrefix: "",
        clickToResetOriginalValue: "",

        // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
        _handles: null,
        _contextObj: null,
        _alertDiv: null,
        _readOnly: null,
        // Added to the original Mendix template to support this particular widget.
        _dirtyFormSelector: null,
        _dirtyFormClass: "dirty-forms-enabled",
        _isDirty: null,

        // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
        constructor: function () {
            logger.debug(this.id + ".constructor");
            
            this._isDirty = false;
            this._readOnly = false;
            this._dirtyFormSelector = "";
            this._handles = [];
        },

        // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
        postCreate: function () {
            logger.debug(this.id + ".postCreate");

            // Identify the 'form' that the widget is dropped on to monitor for changes.
            var dataview = $(this.domNode).closest('.mx-dataview');
            dataview.addClass(this._dirtyFormClass);
            var formId = dataview.attr("id");
            this.set("_dirtyFormSelector", '#' + formId);

            // Initialize the plugin if not done already
            this._initDirtyForms("." + this._dirtyFormClass);

            // Setup the listeners
            this._setupEvents();
            this._setupWatches();
        },

        // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
        update: function (obj, callback) {
            logger.debug(this.id + ".update");

            if (this._contextObj != null) {
                if (obj != null) {
                    if (this._contextObj.getGuid() == obj.getGuid()) {
                        // Same context was updated, clean the form to start again
                        this._cleanDirtyForms();    
                    }

                    // TODO: remove debuglog
                    var attrs = obj.getAttributes();
                    for (var i in attrs) {
                            logger.debug(attrs[i] + ': ' + obj.get(attrs[i]));
                    }         
                }
            }

            // Update internal reference to it's Mendix object
            this._contextObj = obj;
            // Set attribute for DirtyForm (to handle context change in a listening dataview)
            if (this._contextObj != null) {
                domAttr.set(this._dirtyFormSelector.substring(1), 'mendix-context-id', this._contextObj.getGuid());
            }

            // We're passing the callback to updateRendering to be called after DOM-manipulation
            this._updateRendering(callback);
        },

        // mxui.widget._WidgetBase.enable is called when the widget should enable editing. Implement to enable editing if widget is input widget.
        enable: function () {
          logger.debug(this.id + ".enable");
          if (this.resetButton) {
             this.resetButton.disabled = false;
            }
        },

        // mxui.widget._WidgetBase.enable is called when the widget should disable editing. Implement to disable editing if widget is input widget.
        disable: function () {
          logger.debug(this.id + ".disable");
          if (this.resetButton) {
             this.resetButton.disabled = true;
            }
        },

        // mxui.widget._WidgetBase.resize is called when the page's layout is recalculated. Implement to do sizing calculations. Prefer using CSS instead.
        resize: function (box) {
          logger.debug(this.id + ".resize");
        },

        // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
        uninitialize: function () {
          logger.debug(this.id + ".uninitialize");
            // Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
            $(this._dirtyFormSelector).unbind();
        },

        // We want to stop events on a mobile device.
        _stopBubblingEventOnMobile: function (e) {
            logger.debug(this.id + "._stopBubblingEventOnMobile");

            if (typeof document.ontouchstart !== "undefined") {
                dojoEvent.stop(e);
            }
        },

        // Attach events to HTML dom elements.
        _setupEvents: function () {
            logger.debug(this.id + "._setupEvents");

            // JQuery bindings for below instead of dojo, as plugin uses $.trigger() this is more iteroperable.
            // Bind event when the form is initialised by the plugin.
            $(this._dirtyFormSelector).bind('bind.dirtyforms', lang.hitch(this, function(event) {
                logger.debug("Bind event was triggered by " + event.target.id);
            }));
            // Bind event when the form is scanned for input fields.
            $(this._dirtyFormSelector).bind('scan.dirtyforms', lang.hitch(this, function(event) {
                logger.debug("Scan event was triggered by " + event.target.id);
            }));
            // Bind event when the form is rescanned for new input fields.
            $(this._dirtyFormSelector).bind('rescan.dirtyforms', lang.hitch(this, function(event) {
                logger.debug("Rescan was event triggered by " + event.target.id);
            }));


            // Bind event when a field gets dirty. (added to the modified JQuery plugin)
            $(this._dirtyFormSelector).bind('dirtyfield.dirtyforms', lang.hitch(this, function(event, field) {
                logger.debug("Dirty Field was event triggered by " + event.target.id);
                this._optionDisplayOriginalValue(field, true);
            }));
            // Bind event when the field gets clean again by user input. (added to the modified JQuery plugin)
            $(this._dirtyFormSelector).bind('cleanfield.dirtyforms', lang.hitch(this, function(event, field) {
                logger.debug("Clean Field was event triggered by " + event.target.id);
                this._optionDisplayOriginalValue(field, false);
            }));

            // Bind the event when the form gets dirty.
            $(this._dirtyFormSelector).bind('dirty.dirtyforms', lang.hitch(this, function(event) {
                logger.debug("Dirty event was triggered by " + event.target.id);
                if (!this._isDirty) {
                    this.set('_isDirty', true);
                }
            }));
            // Bind the event when the form gets clean again.
            $(this._dirtyFormSelector).bind('clean.dirtyforms', lang.hitch(this, function(event) {
                logger.debug("Clean event was triggered by " + event.target.id);
                if (this._isDirty) {
                    this.set('_isDirty', false);
                }
            }));

            // Bind event when the form is manually set to clean (marks already changed fields as clean).
            $(this._dirtyFormSelector).bind('setclean.dirtyforms', lang.hitch(this, function(event) {
                logger.debug("Setclean was event triggered by " + event.target.id);
            }));
            // Bind event when the form is manually reset.
            $(this._dirtyFormSelector).bind('reset.dirtyforms', lang.hitch(this, function(event) {
                logger.debug("Reset event was triggered by " + event.target.id);
            }));

            // Bind the reset button option
            this._optionResetButton();
        },

        // Monitor when a widget property changes.
        _setupWatches: function () {
            logger.debug(this.id + "._setupWatches");

            // Watch for changes on the dirty state of the widget.
            this.watch("_isDirty", function(name, oldValue, value) {
                logger.debug("_isDirty property on " + this.id + " has changed from " + oldValue + " to " + value);

                if (value) {
                    this.enable();
                    this._optionOnDirtyMicroflow();
                } else {
                    this.disable();
                    this._optionOnCleanMicroflow();
                }
             });

            // Watch for changes on the read-only state of the widget.
            this.watch("_readOnly", function(name, oldValue, value) {
                logger.debug("_readOnly property on " + this.id + " has changed from " + oldValue + " to " + value);

                if (value) {
                    this.disable();
                } else {
                    this.enable();
                }
            });
        },

        // See if to add a reset button dynamically.
        _optionResetButton: function () {
            if (this.hasResetButton) {
                // Create button.
                this.resetButton = dojoConstruct.create("button", {
                    "type": "button",
                    "class": "btn mx-button btn-default",
                    "disabled": "true",
                    "innerHTML": "Reset"
                });
                dojoConstruct.place(this.resetButton, this.domNode);

                // Connect the onclick eventhandler.
                dojo.connect(this.resetButton, "onclick", lang.hitch(this, function(e) {
                    logger.debug("Reset button clicked on " + this.id);

                    // Only on mobile stop event bubbling!
                    this._stopBubblingEventOnMobile(e);

                    // Set the input fields back to their original values.
                    this._resetDirtyForms();              
                }));
            }
        },

        // See if to add a paragraph showing the original value.
        _optionDisplayOriginalValue: function (field, show) {
            if (this.displayOriginalValue) {
                if (show) {
                    $(field).after(lang.hitch(this, function() {
                        return'<p class="help-block original-value">' + 
                            this.originalValuePrefix + 
                            $(field).data('df-orig-' + this._contextObj.getGuid()) + 
                        '</p>';
                    }));

                    if(this.clickToResetOriginalValue) {
                        // Add a event handler when orignal value is double clicked.
                        $(field).next("p").on("dblclick", lang.hitch(this, function(e) {
                            logger.debug("Double click event on original field value");
                        
                            // Only on mobile stop event bubbling!
                            this._stopBubblingEventOnMobile(e);

                            // Reset the field back to original (added to the modified JQuery plugin)
                            this._resetDirtyFormsField(field);
                        }));
                    }
                }
                else {
                    $(field).next("p").remove();
                }
            }
        },

        // See if to pre-load the dataview with dirty fields already
        _optionPreloadMicroflow: function () {
            if (this.preloadMicroflow !== "") {
                // Retrieve the preloaded dirty fields by Microflow and process in callback
                this._execMf(this.preloadMicroflow, this._contextObj.getGuid(), lang.hitch(this, function(objs) {
                    this._preloadDirtyForms(objs);
                }));
            }
        },

        // See if to inform user by microflow that the dataview became dirty.
        _optionOnDirtyMicroflow: function () {
            if (this.onDirtyMicroflow !== "") {
                this._execMf(this.onDirtyMicroflow, this._contextObj.getGuid());
            }
        },

        // See if to inform user that the dataview became clean.
        _optionOnCleanMicroflow: function () {
            if (this.onCleanMicroflow !== "") {
                this._execMf(this.onCleanMicroflow, this._contextObj.getGuid());
            }
        },

        // Initialize the plugin
        _initDirtyForms: function (selector) {
            logger.debug(this.id + "._initDirtyForms");
             
             // For this Mx widget, the root is also the 'form' for the plugin.
             $(selector).dirtyForms({
                formSelector: selector,                 // Selector to find Mendix 'forms'
                message: this.browserCloseNotification, // If not empty, show a popup on browser close
                dirtylog: logger.debug});               // re-use the global Mendix logger
        },

        // Rescan the form for input fields and store their initial state
        _rescanDirtyForms: function () {
            logger.debug(this.id + "._rescanDirtyForms");
            $(this._dirtyFormSelector).dirtyForms('rescan');
        },

        // Preload the form input fields with dirty fields already. (added to the modified JQuery plugin)
        _preloadDirtyForms: function (objs) {
            logger.debug(this.id + "._preloadDirtyForms");

            // Use the widget properties to process the mx objects.
            var fieldname = this.dirtyFieldName.toString();
            var dirtyvalue = this.dirtyValue.toString();
            var dirtyobj= {};
            var preloadObjs = [];
            // Convert to simple name/value pairs
            $.each(objs, function( index, mxobj ) {
                dirtyobj = {
                    name: mxobj.get(fieldname),
                    value: mxobj.get(dirtyvalue)
                }
                preloadObjs.push(dirtyobj);
            });

            // Pass to to the plugin for further processing.
            $(this._dirtyFormSelector).dirtyForms('preload', preloadObjs);
        },

        // Reset the form, restore input fields to their initial state. (added to the modified JQuery plugin)
        _resetDirtyForms: function () {
            logger.debug(this.id + "._resetDirtyForms");
            $(this._dirtyFormSelector).dirtyForms('resetForm');
        },

        // Reset the current field, restore it to its initial state. (added to the modified JQuery plugin)
        _resetDirtyFormsField: function (field) {
            logger.debug(this.id + "._resetDirtyFormsField");
            $(this._dirtyFormSelector).dirtyForms('resetField', field);
        },

        // Clean the form, mark all current fields as clean again. (modified original JQuery plugin feature)
        _cleanDirtyForms: function () {
            logger.debug(this.id + "._cleanDirtyForms");
            $(this._dirtyFormSelector).dirtyForms('setClean');
        },

        // Inform the dirtyforms plugin proactively that a field has changed, as identfied by the Mendix API
        // Custom Mendix widgets don't trigger dom events caught by the plugin if f.e. mx.data.set  is used
        _onFieldChange: function (field) {
            logger.debug(this.id + "._onFieldChange");
            var ev = {target: field, type:"API"};
            $(this._dirtyFormSelector).dirtyForms('onFieldChange', ev);
        },

        // Execute a Mendix Microflow.
        _execMf: function (mf, guid, cb) {
            logger.debug(this.id + "._execMf");

            if (mf && guid) {
                mx.ui.action(mf, {
                    params: {
                        applyto: "selection",
                        guids: [guid]
                    },
                    callback: lang.hitch(this, function (objs) {
                        if (cb && typeof cb === "function") {
                            cb(objs);
                        }
                    }),
                    error: function (error) {
                        console.debug(error.description);
                    }
                }, this);
            }
        },

        // Render the interface.
        _updateRendering: function (callback) {
            logger.debug(this.id + "._updateRendering");

            // Important to clear all validations!
            this._clearValidations();

            // Preload option
            this._optionPreloadMicroflow();
            // Do a scan on the form elements for the particular form of this widget
            this._rescanDirtyForms();
            // Update the read only state of this widget
            if (this.readOnly || this.get("disabled")) this.set('_readOnly', true);
            // Call widget template methods
            this._resetSubscriptions();

            // The callback, coming from update, needs to be executed, to let the page know it finished rendering
            this._executeCallback(callback, "_updateRendering");
        },

        // Handle validations.
        _handleValidation: function (validations) {
            logger.debug(this.id + "._handleValidation");
            this._clearValidations();
        },

        // Clear validations.
        _clearValidations: function () {
            logger.debug(this.id + "._clearValidations");
            dojoConstruct.destroy(this._alertDiv);
            this._alertDiv = null;
        },

        // Show an error message.
        _showError: function (message) {
            logger.debug(this.id + "._showError");
            if (this._alertDiv !== null) {
                dojoHtml.set(this._alertDiv, message);
                return true;
            }
            this._alertDiv = dojoConstruct.create("div", {
                "class": "alert alert-danger",
                "innerHTML": message
            });
            dojoConstruct.place(this._alertDiv, this.domNode);
        },

        // Add a validation.
        _addValidation: function (message) {
            logger.debug(this.id + "._addValidation");
            this._showError(message);
        },

        // Reset subscriptions.
        _resetSubscriptions: function () {
            logger.debug(this.id + "._resetSubscriptions");
            // Release handles on previous object, if any.
            this.unsubscribeAll();

            // When a mendix object exists create subscribtions.
            if (this._contextObj) {
                // Subscribe to general context changes
                this.subscribe({
                    guid: this._contextObj.getGuid(),
                    callback: lang.hitch(this, function (guid) {
                        logger.debug("The mendix context has changed for guid: " + guid);
                        this._cleanDirtyForms();
                    //    this._rescanDirtyForms();
                    })
                });

                // Subscribe to Mendix attribute changes not caught by regular dom events
                var attrs = this._contextObj.getAttributes();
                for (var i in attrs) {
                    // Datepicker widgets (dojo, jquery, boostrap) are not caught by regular dom events of the plugin
                    if (this._contextObj.isDate(attrs[i])) {
                        // Subscribe to attribute changes using the Mendix API instead (used by these widgets also)
                        this.subscribe({
                            guid: this._contextObj.getGuid(),
                            attr: attrs[i],
                            callback: lang.hitch(this, function(guid, attr, value) {
                                logger.debug("The attribute [" + attr + "] changed to value " + value + " for guid: " + guid);
                                var attributeSelector = '.mx-name-' + attr + ' input:first-child';
                                var $field = $(this._dirtyFormSelector).find(attributeSelector);
                                this._onFieldChange($field);
                            })
                        });
                    }
                }
            }
        },

        // Execute Callback.
        _executeCallback: function (cb, from) {
            logger.debug(this.id + "._executeCallback" + (from ? " from " + from : ""));

            if (cb && typeof cb === "function") {
                cb();
            }
        }
    });
});

require(["DirtyForms/widget/DirtyForms"]);