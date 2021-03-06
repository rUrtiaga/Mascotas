const mongoose = require("mongoose")
const Searchs = mongoose.model("Searches_pet")
const fs = require("fs")
const { Schema } = mongoose
const { SERVER_URL, PORT } = require("../../config")

let PetsSchema = new Schema(
    {
        name: String,
        species: String,
        sex: String, //male/female
        age: String,
        description: String,
        search: {
            type: Schema.Types.ObjectId,
            ref: "Search_pet"
        },
        //lista con los nombres de los archivos de el resto de las fotos
        pics: [String],
        //nombre del archivo de la foto principal
        principalPic: String
    },
    {
        timestamps: true
    }
)

//Genera la url en donde esta desplegado actualmente el servidor con referencia a la foto por el id de mascota y su nombre
function UrlPetPicGenerator(id_pet, pic_name) {
    return `${SERVER_URL}:${PORT}/api/pets/${id_pet}/pics/${pic_name}`
}

class Pet {
    /**
     * Metodos de instancia
     */

    async newSearch(location, date) {
        let pet_search = {
            pet: this._id,
            name: this.name,
            age: this.age,
            species: this.species,
            principalPicLocation: this.principalPic
                ? this.principalPicDir()
                : "",
            location: location,
            date: new Date(date)
        }
        if (this.search) {
            await Searchs.findByIdAndDelete(this.search)
        }
        let mongo_search = new Searchs(pet_search)

        //guardo el id de la busqueda en la mascota
        this.search = mongo_search.id

        //hago efectivo los cambios en db
        await mongo_search.save()
        console.log("Created NEW SEARCH on pet", this._id)
        return mongo_search._id
    }

    //devuelve la mascota para visualizar del lado del cliente
    toClient() {
        return {
            name: this.name,
            description: this.description,
            species: this.species,
            age: this.age,
            pics: this.generateUrlPics()
        }
    }

    //retorna una lista con urls a las fotos de la mascota actual, la 0 es la principal
    generateUrlPics() {
        let res = []
        if (this.principalPic) {
            res.push(UrlPetPicGenerator(this._id, this.principalPic))
        }
        this.pics.forEach(pic_name => {
            res.push(UrlPetPicGenerator(this._id, pic_name))
        })
        return res
    }

    //estructura de carpetas donde se encuentran los diferentes archivos de la mascota actual
    picsDir() {
        return `./uploads/${this.parent().id}/${this.id}/`
    }

    //obtiene el path de un determinado archivo, si no esta lanza un error
    getDirPic(pic_name) {
        if (
            this.principalPic != pic_name &&
            !this.pics.some(pn => pn == pic_name)
        ) {
            throw "no valid picname for this pet"
        }
        return this.picsDir() + pic_name
    }

    //obtiene el path de la foto principal de la mascota
    principalPicDir() {
        return this.getDirPic(this.principalPic)
    }

    //asigna el archivo para la foto principal, y borra la foto principal anterior
    setPrincipalPic(fileName) {
        if (this.principalPic) {
            this.deleteImagePet(this.principalPic)
        }
        this.principalPic = fileName
        //Si posee un search actualizo la fotografia
        if (this.search) {
            Searchs.updatePrincipalPic(this.search, this.principalPicDir())
        }
    }

    //devuelve el nombre de todos los archivos que posee esta mascota
    getAllPics() {
        return {
            principal: this.principalPic,
            pics: this.pics
        }
    }

    //setea la lista de archivos como la lista de picks, y borra las anteriores
    setPics(fileNames) {
        if (this.pics.length > 0) {
            this.deleteImagesPet(this.pics)
        }
        this.pics = fileNames
    }

    deleteImagePet(fileName) {
        let dir = this.picsDir()
        //Borro el archivo
        fs.unlinkSync(dir + fileName)
        //Si esta la carpeta vacia la borro
        if (fs.readdirSync(dir) == 0) {
            fs.rmdirSync(dir)
        }
    }

    deleteImagesPet(arrayFilesNames) {
        arrayFilesNames.forEach(fileName => {
            this.deleteImagePet(fileName)
        })
    }

    //borra el archivo, si es que le corresponde a esta mascota
    removePic(id_pic) {
        this.deleteImagePet(id_pic)
        if (this.principalPic == id_pic) {
            this.removePrincipalPic()
            return true
        }
        if (this.pics.length == 0) {
            throw "pic reference not found"
        }
        let indexInPics = this.pics.findIndex(f => f == id_pic)
        if (indexInPics != -1) {
            this.pics.splice(indexInPics)
        }
    }

    //Interno, borra la referencia en otros lugares de la foto principal de la mascota
    removePrincipalPic() {
        // borro la referencia a la imagen actual
        this.principalPic = null
        //borro la refencia a la imagen en los demas lugares
        Searchs.updatePrincipalPic(this.search, null)
    }

    //Borra la busqueda de la mascota actual, hay que pasarle el usuario
    async deleteSearch(user) {
        try {
            await Searchs.findByIdAndDelete(this.search)
        } catch (error) {
            console.log(error)
        }
        this.search = null
        if (user) {
            await user.save()
        }
    }

    //Borra todas las imagenes guardadas
    deleteAllImages() {
        this.deleteImagesPet(this.pics.concat([this.principalPic]))
    }

    preRemove() {
        try {
            this.deleteAllImages()
        } catch (error) {
            console.log("error borrando imagenes", error)
        }
        Searchs.removeWithId(this.search)
    }
}

PetsSchema.loadClass(Pet)

// //Agrega una función middleware antes de remover una mascota
//  //NO FUNCIONA si es un subdocument.
// PetsSchema.pre("remove", function(next) {
//     //remuevo las imagenes
//     console.log("****** antes de borrar")
//     this.deleteAllImages()
//     //remuevo la busqueda
//     Searchs.remove({ _id: this.search }).exec()
//     next()
// })

mongoose.model("Pets", PetsSchema)
module.exports = PetsSchema
