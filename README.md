<a id="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/johnnyo21/floorplan_3d">
    <img src="images/floorplan_3d_logo.png" alt="Logo" width="250" height="250">
  </a>

<h3 align="center">Floorplan 3D - A Home Assistant 3D Floorplan Card</h3>

  <p align="center">
    This card uses three.js to render a 3D model of your home exported from Sweet Home 3d or other software (.obj/.mtl). It is configurable to render your lights in real time by associating them with your light entities and placing the light sources in your model.
    <br />
    <a href="https://github.com/johnnyo21/floorplan_3d"><strong>View Demo »</strong></a>
    <br />
    <br />
    <a href="https://github.com/johnnyo21/floorplan_3d">Get Help</a>
    &middot;
    <a href="https://github.com/johnnyo21/floorplan_3d/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/johnnyo21/floorplan_3d/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>



<!-- ABOUT THE PROJECT -->
## About The Project

<div align="center">
  <a href="https://github.com/johnnyo21/floorplan_3d">
    <img src="images/floorplan_3d_example.png" alt="Example" >
  </a>
</div>


### Built With

* Three.js - <a href="https://threejs.org">threejs.org</a> - Open Source 3d javascrypt library
* Home Assistant - <a href="https://homeassistant.io">homeassistant.io</a> - Open Source Home Automation Software

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- GETTING STARTED -->
## Getting Started

<h3>First things first, you will need a 3d model of your home. </h3>
<p>An eazy way to get started is with <a href="https://www.sweethome3d.com/">Sweet Home 3D (FREE SOFTWARE)</a> - Google some tutorials or videos to help you get started.
<br />
Alternatively, you can use any other 3d design software as long as you can export your models in (.OBJ / .MTL) format.</p>

### Prerequisites

Once you have the model of your home completed.
* npm
  ```sh
  npm install npm@latest -g
  ```

### Installation

1. Get a free API Key at [https://example.com](https://example.com)
2. Clone the repo
   ```sh
   git clone https://github.com/github_username/repo_name.git
   ```
3. Install NPM packages
   ```sh
   npm install
   ```
4. Enter your API in `config.js`
   ```js
   const API_KEY = 'ENTER YOUR API';
   ```
5. Change git remote url to avoid accidental pushes to base project
   ```sh
   git remote set-url origin github_username/repo_name
   git remote -v # confirm the changes
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

Use this space to show useful examples of how a project can be used. Additional screenshots, code examples and demos work well in this space. You may also link to more resources.

_For more examples, please refer to the [Documentation](https://example.com)_

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [ ] Feature 1
- [ ] Feature 2
- [ ] Feature 3
    - [ ] Nested Feature

See the [open issues](https://github.com/github_username/repo_name/issues) for a full list of proposed features (and known issues).

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

Your Name - [@twitter_handle](https://twitter.com/twitter_handle) - email@email_client.com

Project Link: [https://github.com/github_username/repo_name](https://github.com/github_username/repo_name)

<p align="right">(<a href="#readme-top">back to top</a>)</p>
