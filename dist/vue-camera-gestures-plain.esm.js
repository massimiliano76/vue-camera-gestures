import { load } from '@tensorflow-models/mobilenet';
import { browser as browser$1 } from '@tensorflow/tfjs';
import { create } from '@tensorflow-models/knn-classifier';

var global$1 = (typeof global !== "undefined" ? global :
            typeof self !== "undefined" ? self :
            typeof window !== "undefined" ? window : {});

//
// K value for KNN
var TOPK = 10;

var script = {
  name: 'CameraGestures',
  props: {
    fireOnce: {
      type: Boolean,
      default: true
    },
    gestures: {
      type: Array
    },
    requiredAccuracy: {
      type: Number,
      default: 90
    },
    throttleEvents: {
      type: Boolean,
      default: false
    },
    trainingDelay: {
      type: Number,
      default: 1000
    },
    trainingPromptPrefix: {
      type: String,
      default: 'Perform a gesture: '
    },
    trainingTime: {
      type: Number,
      default: 3000
    },
    verificationDelay: {
      type: Number,
      default: 1000
    },
    verificationPromptPrefix: {
      type: String,
      default: 'Verify gesture: '
    },
    verificationTime: {
      type: Number,
      default: 1000
    }
  },
  computed: {
    computedGestures: function () {
      var this$1 = this;

      if (this.gestures === undefined) {
        var reservedEventNames = [
          'DONETRAINING',
          'DONEVERIFICATION',
          'NEUTRAL',
          'VERIFICATIONFAILED'
        ];
        var filteredEventNames = Object.keys(this.$listeners).filter(function (x) { return !reservedEventNames.includes(x.toUpperCase); });
        return filteredEventNames.map(function (x) {
          // convert event name from camelCase to Sentence Case
          var name = x.replace(/(A-Z)/g, ' $1');
          name = name.charAt(0).toUpperCase() + name.slice(1);
          return {
            event: x,
            fireOnce: this$1.fireOnce,
            name: name,
            requiredAccuracy: this$1.requiredAccuracy,
            throttleEvent: this$1.throttleEvents,
            trainingDelay: this$1.trainingDelay,
            trainingPrompt: this$1.trainingPromptPrefix + name,
            trainingTime: this$1.trainingTime,
            verificationDelay: this$1.verificationDelay,
            verificationPrompt: this$1.verificationPromptPrefix + name,
            verificationTime: this$1.verificationTime,
            isNeutral: false
          }
        })
      }
      return this.gestures.map(function (x) {
        var name;
        if (x.name) {
          name = x.name;
        } else {
          name = x.event.replace(/(A-Z)/g, ' $1');
          name = name.charAt(0).toUpperCase() + name.slice(1);
        }
        return {
          event: x.event,
          fireOnce: x.fireOnce === undefined ? this$1.fireOnce : x.fireOnce,
          name: name,
          requiredAccuracy: x.requiredAccuracy === undefined ? this$1.requiredAccuracy : x.requiredAccuracy,
          throttleEvent: x.throttleEvent === undefined ? this$1.throttleEvents : x.throttleEvent,
          trainingDelay: x.trainingDelay === undefined ? this$1.trainingDelay : x.trainingDelay,
          trainingPrompt: x.trainingPrompt === undefined ? this$1.trainingPromptPrefix + name : x.trainingPrompt,
          trainingTime: x.trainingTime === undefined ? this$1.trainingTime : x.trainingTime,
          verificationDelay: x.verificationPromptPrefix === undefined ? this$1.verificationPromptPrefix : x.verificationPromptPrefix,
          verificationPrompt: x.verificationPrompt === undefined ? this$1.verificationPromptPrefix + name : x.verificationPrompt,
          verificationTime: x.verificationTime === undefined ? this$1.verificationTime : x.verificationTime
        }
      })
    }
  },
  mounted: async function () {
    this.knn = create();
    this.mobilenet = await load();
    var stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    this.$refs.video.srcObject = stream;
    this.$refs.video.play();
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.intervalId = setInterval(this.updateState, 2000);
  },
  data: function () {
    return {
      videoPlaying: false,
      // can be "training", "testing" or "predicting"
      state: 'training',
      preparing: false,
      currentGestureIndex: -1,
      prediction: null
    }
  },
  methods: {
    animate: async function animate () {
      if (this.videoPlaying) {
        // Get image data from video element
        var image = browser$1.fromPixels(this.$refs.video);
        switch (this.state) {
          case 'training':
            this.trainFrame(image);
            break
          case 'testing':
            this.testFrame(image);
            break
          case 'predicting':
            this.predictFrame(image);
            break
        }

        image.dispose();
      }
      this.animationFrameId = requestAnimationFrame(this.animate);
    },
    trainFrame: function trainFrame (image) {
      if (this.currentGestureIndex !== -1 && !this.preparing) {
        var logits = this.mobilenet.infer(image, 'conv_preds');
        this.knn.addExample(logits, this.currentGestureIndex);
        logits.dispose();
      }
    },
    testFrame: async function testFrame (image) {
      if (this.currentGestureIndex !== -1) {
        var logits = this.mobilenet.infer(image, 'conv_preds');
        var res = await this.knn.predictClass(logits, TOPK);
        console.log('testing: predicting that current gesture is index ' + res.classIndex + ' with confidence ' + (res.confidences[res.classIndex] * 100) + '%');
        logits.dispose();
      }
    },
    predictFrame: async function predictFrame (image) {
      var logits = this.mobilenet.infer(image, 'conv_preds');
      var res = await this.knn.predictClass(logits, TOPK);
      // console.log('testing: predicting that current gesture is index ' + res.classIndex + ' with confidence ' + (res.confidences[res.classIndex] * 100) + '%')
      this.prediction = this.computedGestures[res.classIndex];
      this.$emit(this.prediction.event);
      logits.dispose();
    },
    updateState: function updateState () {
      if (this.preparing) {
        this.preparing = false;
        return
      }
      if (this.currentGestureIndex < this.computedGestures.length - 1) {
        this.currentGestureIndex++;
        this.preparing = true;
      } else {
        // this.currentGestureIndex = 0
        if (this.state === 'training') {
          this.state = 'predicting';
        } else {
          this.state = 'predicting';
          clearInterval(this.intervalId);
        }
      }
    },
    reset: function reset () {
      this.knn.clearAllClasses();
      this.state = 'training';
      this.preparing = true;
      this.currentGestureIndex = 0;
      this.intervalId = setInterval(this.updateState, 2000);
    }
  }
};

function normalizeComponent(template, style, script, scopeId, isFunctionalTemplate, moduleIdentifier
/* server only */
, shadowMode, createInjector, createInjectorSSR, createInjectorShadow) {
  if (typeof shadowMode !== 'boolean') {
    createInjectorSSR = createInjector;
    createInjector = shadowMode;
    shadowMode = false;
  } // Vue.extend constructor export interop.


  var options = typeof script === 'function' ? script.options : script; // render functions

  if (template && template.render) {
    options.render = template.render;
    options.staticRenderFns = template.staticRenderFns;
    options._compiled = true; // functional template

    if (isFunctionalTemplate) {
      options.functional = true;
    }
  } // scopedId


  if (scopeId) {
    options._scopeId = scopeId;
  }

  var hook;

  if (moduleIdentifier) {
    // server build
    hook = function hook(context) {
      // 2.3 injection
      context = context || // cached call
      this.$vnode && this.$vnode.ssrContext || // stateful
      this.parent && this.parent.$vnode && this.parent.$vnode.ssrContext; // functional
      // 2.2 with runInNewContext: true

      if (!context && typeof __VUE_SSR_CONTEXT__ !== 'undefined') {
        context = __VUE_SSR_CONTEXT__;
      } // inject component styles


      if (style) {
        style.call(this, createInjectorSSR(context));
      } // register component module identifier for async chunk inference


      if (context && context._registeredComponents) {
        context._registeredComponents.add(moduleIdentifier);
      }
    }; // used by ssr in case component is cached and beforeCreate
    // never gets called


    options._ssrRegister = hook;
  } else if (style) {
    hook = shadowMode ? function () {
      style.call(this, createInjectorShadow(this.$root.$options.shadowRoot));
    } : function (context) {
      style.call(this, createInjector(context));
    };
  }

  if (hook) {
    if (options.functional) {
      // register for functional component in vue file
      var originalRender = options.render;

      options.render = function renderWithStyleInjection(h, context) {
        hook.call(context);
        return originalRender(h, context);
      };
    } else {
      // inject component registration as beforeCreate hook
      var existing = options.beforeCreate;
      options.beforeCreate = existing ? [].concat(existing, hook) : [hook];
    }
  }

  return script;
}

var normalizeComponent_1 = normalizeComponent;

var isOldIE = typeof navigator !== 'undefined' && /msie [6-9]\\b/.test(navigator.userAgent.toLowerCase());
function createInjector(context) {
  return function (id, style) {
    return addStyle(id, style);
  };
}
var HEAD;
var styles = {};

function addStyle(id, css) {
  var group = isOldIE ? css.media || 'default' : id;
  var style = styles[group] || (styles[group] = {
    ids: new Set(),
    styles: []
  });

  if (!style.ids.has(id)) {
    style.ids.add(id);
    var code = css.source;

    if (css.map) {
      // https://developer.chrome.com/devtools/docs/javascript-debugging
      // this makes source maps inside style tags work properly in Chrome
      code += '\n/*# sourceURL=' + css.map.sources[0] + ' */'; // http://stackoverflow.com/a/26603875

      code += '\n/*# sourceMappingURL=data:application/json;base64,' + btoa(unescape(encodeURIComponent(JSON.stringify(css.map)))) + ' */';
    }

    if (!style.element) {
      style.element = document.createElement('style');
      style.element.type = 'text/css';
      if (css.media) { style.element.setAttribute('media', css.media); }

      if (HEAD === undefined) {
        HEAD = document.head || document.getElementsByTagName('head')[0];
      }

      HEAD.appendChild(style.element);
    }

    if ('styleSheet' in style.element) {
      style.styles.push(code);
      style.element.styleSheet.cssText = style.styles.filter(Boolean).join('\n');
    } else {
      var index = style.ids.size - 1;
      var textNode = document.createTextNode(code);
      var nodes = style.element.childNodes;
      if (nodes[index]) { style.element.removeChild(nodes[index]); }
      if (nodes.length) { style.element.insertBefore(textNode, nodes[index]); }else { style.element.appendChild(textNode); }
    }
  }
}

var browser = createInjector;

/* script */
var __vue_script__ = script;

/* template */
var __vue_render__ = function () {var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('div',[_c('video',{ref:"video",attrs:{"autoplay":"","playsinline":"","width":"227","height":"227"},on:{"playing":function($event){_vm.videoPlaying = true;},"pause":function($event){_vm.videoPlaying = false;}}}),_vm._v(" "),_c('p',[_vm._v("State: "+_vm._s(_vm.state))]),_vm._v(" "),(_vm.preparing)?_c('p',[_vm._v("Prepare to")]):_vm._e(),_vm._v(" "),(_vm.currentGestureIndex > -1)?_c('p',[_vm._v("Gesture: "+_vm._s(_vm.computedGestures[_vm.currentGestureIndex].name))]):_vm._e(),_vm._v(" "),_c('p',[_vm._v("Prediction: "+_vm._s(_vm.prediction))]),_vm._v(" "),_c('button',{on:{"click":_vm.reset}},[_vm._v("Reset")])])};
var __vue_staticRenderFns__ = [];

  /* style */
  var __vue_inject_styles__ = function (inject) {
    if (!inject) { return }
    inject("data-v-15adb254_0", { source: "video[data-v-15adb254]{transform:rotateY(180deg);-webkit-transform:rotateY(180deg);-moz-transform:rotateY(180deg)}", map: undefined, media: undefined });

  };
  /* scoped */
  var __vue_scope_id__ = "data-v-15adb254";
  /* module identifier */
  var __vue_module_identifier__ = undefined;
  /* functional template */
  var __vue_is_functional_template__ = false;
  /* style inject SSR */
  

  
  var cameraGestures = normalizeComponent_1(
    { render: __vue_render__, staticRenderFns: __vue_staticRenderFns__ },
    __vue_inject_styles__,
    __vue_script__,
    __vue_scope_id__,
    __vue_is_functional_template__,
    __vue_module_identifier__,
    browser,
    undefined
  );

// Declare install function executed by Vue.use()
function install(Vue) {
  if (install.installed) { return; }
  install.installed = true;
  Vue.component('CameraGestures', cameraGestures);
}

// Create module definition for Vue.use()
var plugin = {
  install: install,
};

// Auto-install when vue is found (eg. in browser via <script> tag)
var GlobalVue = null;
if (typeof window !== 'undefined') {
  GlobalVue = window.Vue;
} else if (typeof global$1 !== 'undefined') {
  GlobalVue = global$1.Vue;
}
if (GlobalVue) {
  GlobalVue.use(plugin);
}

export default cameraGestures;
export { install };
