const code_input = document.getElementById('code');
const output = document.getElementById('output');

function annotateModel(model) {
    //Add environment box
    model['boxes'].push({
        name: "Env", 
        session: [], 
        parties: "*", 
        methods: []
    });

    //Annotate with the unique caller of each method

    return model;
}

function annotatedModelToTikz(model) {
    //Variables
    boxwidth = 10;
    verticalLayerDistance = 5; 

    result = "";

    

    //Draw env
    result += String.raw`
    \node (env) at (0,0) [draw,thick,minimum height=2cm,text width = 30cm,anchor=north west] 
    {\textbf{Env}\\ 
    $\mathbf{P} = \mathbb{Z}\times\{honest\}$\\
    Box session: $[\mathrm{Session}, \mathrm{Sess2}]$ \\ 
    ~ \\ 
    $\mathsf{main}()$
    };
    `


    return result;
}

function compile() {
    //Parse yaml
    model = jsyaml.load(document.getElementById("yaml").textContent);
    console.log(model);
    
    //Annotate model
    annotatedModel = annotateModel(model);
    console.log(annotatedModel);

    //Compile model to tikz (or handle error)
    if (annotatedModel){
        result = annotatedModelToTikz(annotateModel);
        code_input.value = result;
    } else {
        code_input.value = "\\node[] {Invalid model. See browser log.};";
    }

    update();
}

function update() {
  const s = document.createElement('script');
  s.setAttribute('type','text/tikz');
  s.textContent = `
\\newcommand{\\mathbb}[1]{\\mathbf{#1}} %workaround for mathbb
\\renewcommand{\\times}{~\\mathsf{x}~}
\\begin{tikzpicture}
${code_input.value}
\\end{tikzpicture}
  `;
  output.innerHTML = '';
  output.appendChild(s);
  process_tikz(s);
}

let debounce_update = null;
let debounce_do = false;

// update();
// window.updateTikz = update;

// window.onload = async function () {
//     await load();
  
//     async function process(elt) {
//       var text = elt.childNodes[0].nodeValue;
//       var div = document.createElement('div');
//       let dvi = await tex(text);
//       let html = "";
//       const page = new stream__WEBPACK_IMPORTED_MODULE_1__["Writable"]({
//         write(chunk, encoding, callback) {
//           html = html + chunk.toString();
//           callback();
//         }
  
//       });
  
//       async function* streamBuffer() {
//         yield Buffer.from(dvi);
//         return;
//       }
  
//       let machine = await Object(dvi2html__WEBPACK_IMPORTED_MODULE_0__["dvi2html"])(streamBuffer(), page);
//       div.style.display = 'flex';
//       div.style.width = machine.paperwidth.toString() + "pt";
//       div.style.height = machine.paperheight.toString() + "pt";
//       div.style['align-items'] = 'center';
//       div.style['justify-content'] = 'center';
//       div.innerHTML = html;
//       let svg = div.getElementsByTagName('svg');
//       svg[0].setAttribute("width", machine.paperwidth.toString() + "pt");
//       svg[0].setAttribute("height", machine.paperheight.toString() + "pt");
//       svg[0].setAttribute("viewBox", `-72 -72 ${machine.paperwidth} ${machine.paperheight}`);
//       elt.parentNode.replaceChild(div, elt);
//     }
    
//     window.process_tikz = process;
  
//     ;
//     var scripts = document.getElementsByTagName('script');
//     var tikzScripts = Array.prototype.slice.call(scripts).filter(e => e.getAttribute('type') === 'text/tikz');
//     tikzScripts.reduce(async (promise, element) => {
//       await promise;
//       return process(element);
//     }, Promise.resolve());
//   };
  