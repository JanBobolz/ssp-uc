const code_input = document.getElementById('code');
const output = document.getElementById('output');

function annotateModel(model) {
    //Add environment box
    model['boxes'].push({
        name: "Env", 
        session: [], 
        parties: "*", 
        methods: [
            {name: "main", party: false, 'caller-session': [], async: true},
            {name: "handle", party: "A", 'caller-session': ["*"], async: true}
        ]
    });

    //Add implicit default values.
    for (box of model['boxes']) {
        if (!('methods' in box))
            box['methods'] = [];
        
        for (method of box['methods']) {
            //Add caller-session to method if missing, default to box's session minus the last bit
            if (!('caller-session' in method)) {
                if (box['session'].length == 0) {
                    log("Box "+box.name+" needs a non-empty session");
                    return false;
                }
                method['caller-session'] = box['session'].slice(0,-1);
            }

            //Default async flag: false.
            method['async'] = 'async' in method ? true : false;
        }

    }

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
    model = jsyaml.load(document.getElementById("yaml").value);
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
  s.value = `
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
  